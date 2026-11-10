import axios, { AxiosError, AxiosRequestConfig, AxiosResponse } from "axios";
import dns from "dns";
import nodeHttp from "http";
import https from "https";
import net from "net";

// ===========================
// Chặn truy cập địa chỉ nội bộ (SSRF): khi deploy công khai, không cho người dùng
// bắt server tải http://localhost, 192.168.x.x, metadata cloud 169.254.169.254, ...
// Kiểm tra ở bước DNS nên áp dụng cho cả redirect.
// Đặt ALLOW_PRIVATE_URLS=true để tắt (chỉ dùng khi test local).
// ===========================
const blocked = new net.BlockList();
for (const [addr, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.168.0.0", 16],
  ["198.18.0.0", 15], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) blocked.addSubnet(addr, prefix, "ipv4");
for (const [addr, prefix] of [["::", 128], ["::1", 128], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8]] as const)
  blocked.addSubnet(addr, prefix, "ipv6");

export function isPrivateAddress(address: string): boolean {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address)?.[1];
  if (mapped) return blocked.check(mapped, "ipv4");
  return blocked.check(address, net.isIPv6(address) ? "ipv6" : "ipv4");
}

export class PrivateAddressError extends Error {
  code = "ERR_PRIVATE_ADDRESS";
  constructor(host: string) {
    super(`Refusing to fetch internal address (${host})`);
  }
}

const allowPrivate = () => /^(1|true|yes)$/i.test(process.env.ALLOW_PRIVATE_URLS ?? "");

type LookupCb = (err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void;

function safeLookup(hostname: string, options: dns.LookupOptions, callback: LookupCb) {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, "");
    if (!allowPrivate() && addresses.some((a) => isPrivateAddress(a.address))) {
      return callback(new PrivateAddressError(hostname), "");
    }
    if (options.all) return callback(null, addresses);
    const first = addresses[0];
    callback(null, first.address, first.family);
  });
}

/** IP viết trực tiếp trong URL không đi qua DNS → kiểm tra riêng. */
export function assertPublicHost(hostname: string | undefined | null) {
  if (!hostname || allowPrivate()) return;
  const host = hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost")) throw new PrivateAddressError(host);
  if (net.isIP(host) && isPrivateAddress(host)) throw new PrivateAddressError(host);
}

const agentOptions = { keepAlive: true, maxSockets: 16, lookup: safeLookup as never };

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

export const http = axios.create({
  timeout: 30_000,
  maxRedirects: 5,
  httpAgent: new nodeHttp.Agent(agentOptions),
  httpsAgent: new https.Agent(agentOptions),
  // Kiểm tra cả URL đích của mỗi lần redirect
  beforeRedirect: (options: Record<string, unknown>) => {
    assertPublicHost(options.hostname as string);
  },
  headers: {
    "User-Agent": USER_AGENT,
    "Accept-Language": "vi,en;q=0.8",
  },
});

http.interceptors.request.use((config) => {
  if (config.url) {
    try {
      assertPublicHost(new URL(config.url).hostname);
    } catch (err) {
      if (err instanceof PrivateAddressError) throw err;
    }
  }
  return config;
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isRetryable(err: unknown): boolean {
  if (!axios.isAxiosError(err)) return false;
  if (err.cause instanceof PrivateAddressError || err.code === "ERR_PRIVATE_ADDRESS") return false;
  const status = err.response?.status;
  if (!status) return true; // network error / timeout
  return status === 408 || status === 429 || status >= 500;
}

/** Request with exponential backoff on network errors, 429 and 5xx. */
export async function requestWithRetry<T = unknown>(
  config: AxiosRequestConfig,
  retries = 3
): Promise<AxiosResponse<T>> {
  let attempt = 0;
  for (;;) {
    try {
      return await http.request<T>(config);
    } catch (err) {
      if (attempt >= retries || !isRetryable(err)) throw err;
      const retryAfter = Number(
        (err as AxiosError).response?.headers?.["retry-after"]
      );
      const delay =
        Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.min(retryAfter * 1000, 15_000)
          : 800 * 2 ** attempt;
      attempt++;
      await sleep(delay);
    }
  }
}

// ===========================
// Cookies (tối giản, đủ cho cookie mật khẩu của WordPress)
// ===========================
export type CookieJar = Map<string, string>;

export function readSetCookies(res: AxiosResponse, jar: CookieJar) {
  const raw = res.headers["set-cookie"];
  if (!raw) return;
  for (const line of Array.isArray(raw) ? raw : [raw]) {
    const pair = line.split(";")[0];
    const eq = pair.indexOf("=");
    if (eq <= 0) continue;
    jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
}

export function cookieHeader(jar?: CookieJar): string | undefined {
  if (!jar || jar.size === 0) return undefined;
  return [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
}

export interface HtmlPage {
  url: string; // URL cuối cùng sau redirect
  html: string;
}

export async function fetchHtml(url: string, jar?: CookieJar): Promise<HtmlPage> {
  const res = await requestWithRetry<string>({
    url,
    method: "GET",
    responseType: "text",
    headers: {
      Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
      ...(jar && jar.size ? { Cookie: cookieHeader(jar) } : {}),
    },
  });
  if (jar) readSetCookies(res, jar);
  const finalUrl = res.request?.res?.responseUrl ?? url;
  return { url: finalUrl, html: String(res.data ?? "") };
}

export interface BinaryResource {
  data: Buffer;
  contentType: string;
}

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

export async function fetchBinary(url: string, referer?: string): Promise<BinaryResource> {
  if (url.startsWith("data:")) return decodeDataUri(url);

  const res = await requestWithRetry<ArrayBuffer>({
    url,
    method: "GET",
    responseType: "arraybuffer",
    maxContentLength: MAX_IMAGE_BYTES,
    headers: {
      // Không khai báo webp/avif để CDN (i0.wp.com, ...) trả về jpeg/png – định dạng mọi máy đọc EPUB đều hỗ trợ
      Accept: "image/jpeg,image/png,image/gif,image/svg+xml;q=0.9,*/*;q=0.5",
      ...(referer ? { Referer: referer } : {}),
    },
  });
  return {
    data: Buffer.from(res.data),
    contentType: String(res.headers["content-type"] ?? ""),
  };
}

function decodeDataUri(uri: string): BinaryResource {
  const m = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(uri);
  if (!m) throw new Error("Invalid data URI");
  const data = m[2]
    ? Buffer.from(m[3], "base64")
    : Buffer.from(decodeURIComponent(m[3]), "utf8");
  return { data, contentType: m[1] || "" };
}

export function isPrivateAddressError(err: unknown): boolean {
  return (
    err instanceof PrivateAddressError ||
    (axios.isAxiosError(err) && (err.code === "ERR_PRIVATE_ADDRESS" || err.cause instanceof PrivateAddressError))
  );
}

export function describeHttpError(err: unknown): string {
  if (isPrivateAddressError(err)) return "internal/private address is not allowed";
  if (axios.isAxiosError(err)) {
    if (err.response) return `HTTP ${err.response.status}`;
    if (err.code === "ECONNABORTED") return "timeout";
    return err.code ?? err.message;
  }
  return err instanceof Error ? err.message : String(err);
}

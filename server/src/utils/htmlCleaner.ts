import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import type { AnyNode, Element } from "domhandler";
import { serializeXhtml } from "./xml";

export interface CleanResult {
  /** Fragment XHTML hợp lệ, ảnh vẫn trỏ tới URL tuyệt đối (sẽ được nhúng sau). */
  html: string;
  /** URL tuyệt đối của các ảnh trong chương, theo thứ tự, không trùng. */
  images: string[];
  /** Số ký tự chữ thực sự (để nhận biết chương toàn ảnh). */
  textLength: number;
}

// Xoá hẳn (cả nội dung)
const REMOVE_TAGS =
  "script,style,iframe,form,input,button,select,textarea,label,svg,canvas,video,audio,object,embed,link,meta,nav,footer,template,dialog";

const JUNK_SELECTORS = [
  ".sharedaddy",
  ".jp-relatedposts",
  "#jp-post-flair",
  ".sd-sharing",
  ".wpcnt",
  ".wordads-ad-wrapper",
  ".adsbygoogle",
  ".code-block",
  ".post-navigation",
  ".nav-links",
  ".page-links",
  ".wp-block-buttons",
  ".display-posts-listing",
  ".post-password-form",
  ".ppw-post-password-container",
  ".wp-block-embed",
  ".jetpack-video-wrapper",
  ".wp-block-jetpack-subscriptions",
  ".wp-block-file",
  ".screen-reader-text",
].join(",");

// Thẻ được giữ lại trong EPUB; thẻ khác sẽ bị "unwrap" (giữ nội dung con)
const ALLOWED_TAGS = new Set([
  "p", "br", "hr", "div", "blockquote", "pre", "code",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "strong", "b", "em", "i", "u", "s", "del", "sub", "sup", "small", "mark",
  "ul", "ol", "li", "dl", "dt", "dd",
  "table", "thead", "tbody", "tfoot", "tr", "td", "th", "caption",
  "img", "figure", "figcaption", "ruby", "rt", "rp", "q", "cite", "abbr",
]);

const RENAME_TAGS: Record<string, string> = {
  center: "div",
  section: "div",
  article: "div",
  aside: "div",
  details: "div",
  summary: "p",
  strike: "s",
  tt: "code",
};

const ALLOWED_ATTRS: Record<string, string[]> = {
  img: ["src", "alt"],
  td: ["colspan", "rowspan"],
  th: ["colspan", "rowspan"],
  ol: ["start"],
};

const NAV_ARROWS = /[‹›«»<>←→⟵⟶⇐⇒|]/g;
const NAV_TEXT =
  /^(?:(?:chương|chap(?:ter)?)\s*(?:trước|sau|tiếp(?:\s*theo)?)|mục\s*lục|trang\s*chủ|danh\s*sách\s*chương|quay\s*lại|prev(?:ious)?(?:\s*chapter)?|next(?:\s*chapter)?|index|table of contents|toc|home)$/i;

const IMAGE_EXT = /\.(?:jpe?g|png|gif|webp|bmp|avif)(?:$|[?#])/i;
const PLACEHOLDER_SRC = /(?:blank|spacer|placeholder|lazy[_-]?load|loading|transparent|pixel)\.(?:gif|png|svg)/i;
const MAX_SRCSET_WIDTH = 1600;

function absolutize(src: string | undefined, base: string): string | null {
  if (!src) return null;
  const s = src.trim();
  if (!s) return null;
  if (s.startsWith("data:")) return s.length > 200 ? s : null; // bỏ placeholder base64 nhỏ
  try {
    const u = new URL(s, base);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.href;
  } catch {
    return null;
  }
}

function bestFromSrcset(srcset: string | undefined): string | undefined {
  if (!srcset) return;
  const items = srcset
    .split(/,\s+(?=\S)/)
    .map((part) => {
      const [u, d] = part.trim().split(/\s+/);
      const w = d?.endsWith("w") ? parseInt(d, 10) : d?.endsWith("x") ? parseFloat(d) * 1000 : 0;
      return { u, w: Number.isFinite(w) ? w : 0 };
    })
    .filter((x) => x.u);
  if (!items.length) return;
  const fitting = items.filter((x) => x.w <= MAX_SRCSET_WIDTH).sort((a, b) => b.w - a.w);
  if (fitting.length) return fitting[0].u;
  return items.sort((a, b) => a.w - b.w)[0].u;
}

/** Chọn URL ảnh thật, kể cả khi theme/plugin dùng lazy-load. */
function resolveImageSrc($: CheerioAPI, img: Element, base: string): string | null {
  const $img = $(img);

  // Ảnh bọc trong link tới bản gốc (gallery/thumbnail) → lấy bản gốc
  const parentLink = $img.closest("a").attr("href");
  if (parentLink && IMAGE_EXT.test(parentLink)) {
    const abs = absolutize(parentLink, base);
    if (abs) return abs;
  }

  const candidates = [
    bestFromSrcset($img.attr("data-lazy-srcset")),
    bestFromSrcset($img.attr("data-srcset")),
    $img.attr("data-lazy-src"),
    $img.attr("data-src"),
    $img.attr("data-original"),
    $img.attr("data-orig-src"),
    bestFromSrcset($img.attr("srcset")),
    $img.attr("data-large-file"),
    $img.attr("src"),
    $img.attr("data-orig-file"),
  ];

  for (const c of candidates) {
    if (!c || PLACEHOLDER_SRC.test(c)) continue;
    const abs = absolutize(c, base);
    if (abs) return abs;
  }
  return null;
}

/** Độ rộng khai báo (px) qua thuộc tính width hoặc style; Infinity nếu không rõ. */
export function declaredWidth(widthAttr?: string, style?: string): number {
  const fromStyle = /(?:^|;)\s*(?:max-)?width\s*:\s*(\d+(?:\.\d+)?)px/i.exec(style ?? "")?.[1];
  const raw = fromStyle ?? (widthAttr && /^\d+$/.test(widthAttr.trim()) ? widthAttr : undefined);
  return raw ? parseFloat(raw) : Infinity;
}

const HIDDEN_STYLE = /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden)/i;

/**
 * Xoá phần tử bị ẩn – thường là watermark/bẫy chống cào dữ liệu:
 *  - style inline `display:none` / `visibility:hidden`, thuộc tính `hidden`
 *  - class bị ẩn bởi khối <style> nhỏ nhúng trong body (bỏ qua @media và CSS lớn của theme)
 */
export function removeHiddenElements($: CheerioAPI) {
  const hiddenClasses = new Set<string>();
  $("style").each((_, el) => {
    if ($(el).closest("head").length) return;
    const css = $(el).text();
    if (css.length > 5000) return;
    const topLevel = css.replace(/@[^{]+\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "");
    for (const m of topLevel.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!/display\s*:\s*none/i.test(m[2])) continue;
      for (const sel of m[1].split(",")) {
        const cls = /^\s*\.([\w-]+)\s*$/.exec(sel)?.[1];
        if (cls) hiddenClasses.add(cls);
      }
    }
  });
  for (const cls of hiddenClasses) $(`.${cls}`).remove();

  $("[style]")
    .filter((_, el) => HIDDEN_STYLE.test($(el).attr("style") ?? ""))
    .remove();
  $("[hidden]").remove();
}

function linkDensityJunk($: CheerioAPI, el: Element): boolean {
  const $el = $(el);
  const links = $el.find("a[href]");
  if (links.length < 3) return false;
  const total = $el.text().replace(/\s+/g, "").length;
  if (total === 0) return $el.find("img").length === 0;
  let linkText = 0;
  links.each((_, a) => {
    linkText += $(a).text().replace(/\s+/g, "").length;
  });
  return linkText / total >= 0.6;
}

export function cleanHtml(html: string, baseUrl: string): CleanResult {
  // scriptingEnabled:false → nội dung <noscript> được parse thành phần tử thật
  const $ = cheerio.load(html, { scriptingEnabled: false }, false);

  // 1. Cứu ảnh nằm trong <noscript> (lazy-load) – thay cho ảnh placeholder phía trước
  $("noscript").each((_, el) => {
    const $ns = $(el);
    if ($ns.find("img").length) {
      const prev = $ns.prev();
      if (prev.is("img")) prev.remove();
      $ns.replaceWith($ns.contents());
    } else {
      $ns.remove();
    }
  });

  // 2. Xoá phần tử ẩn (watermark) và thẻ không phải nội dung
  removeHiddenElements($);
  $(REMOVE_TAGS).remove();

  // 3. Xoá khối điều hướng/danh sách chương (mật độ link cao) – làm trước khi
  //    xoá .display-posts-listing để cả khung mục lục bao quanh cũng bị nhận ra
  $("ul, ol, div, details, p, table, section, center").each((_, el) => {
    if (linkDensityJunk($, el as Element)) $(el).remove();
  });
  $("details").each((_, el) => {
    if ($(el).find(".display-posts-listing, a[href]").length >= 2) $(el).remove();
  });
  $(JUNK_SELECTORS).remove();
  $("ins.adsbygoogle, [id^='atatags'], [class*='wordads']").remove();

  // Emoji của WordPress (ảnh) → ký tự
  $("img.emoji, img.wp-smiley").each((_, el) => {
    $(el).replaceWith($(el).attr("alt") ?? "");
  });

  // 4. Xoá link điều hướng lẻ ("‹", "Chương sau", "Mục lục", ...)
  $("a").each((_, el) => {
    const $a = $(el);
    if ($a.find("img").length) return;
    const text = $a.text().replace(NAV_ARROWS, " ").replace(/\s+/g, " ").trim();
    if (!text || NAV_TEXT.test(text)) $a.remove();
  });

  // 5. Ảnh: xác định URL thật
  $("img").each((_, el) => {
    // Sticker/icon nhỏ trang trí (khai báo width ≤ 120px) → bỏ
    if (declaredWidth($(el).attr("width"), $(el).attr("style")) <= 120) {
      $(el).remove();
      return;
    }
    const src = resolveImageSrc($, el as Element, baseUrl);
    if (!src) {
      $(el).remove();
      return;
    }
    const alt = $(el).attr("alt") ?? "";
    (el as Element).attribs = { src, alt };
  });

  // 6. Chuẩn hoá thẻ + thuộc tính (duyệt từ trong ra ngoài để unwrap an toàn)
  const elements = $("*").toArray().reverse() as Element[];
  for (const el of elements) {
    let name = el.name.toLowerCase();
    if (RENAME_TAGS[name]) {
      el.name = RENAME_TAGS[name];
      name = el.name;
    }
    if (!ALLOWED_TAGS.has(name)) {
      $(el).replaceWith($(el).contents());
      continue;
    }
    const style = el.attribs.style ?? "";
    const align = /text-align\s*:\s*(center|right)/i.exec(style)?.[1]?.toLowerCase();
    const keep = ALLOWED_ATTRS[name] ?? [];
    const next: Record<string, string> = {};
    for (const key of keep) {
      if (el.attribs[key] !== undefined) next[key] = el.attribs[key];
    }
    if (align && name !== "img") next.style = `text-align:${align}`;
    el.attribs = next;
  }

  // 7. Xoá khối rỗng (lặp vì xoá con có thể làm cha rỗng)
  const BLOCKS = "p, div, h1, h2, h3, h4, h5, h6, li, ul, ol, blockquote, figure, strong, b, em, i, u";
  for (let pass = 0; pass < 3; pass++) {
    let removed = 0;
    $(BLOCKS).each((_, el) => {
      const $el = $(el);
      if ($el.find("img, hr, br").length) return;
      if ($el.text().replace(/[\s ​]/g, "").length === 0) {
        $el.remove();
        removed++;
      }
    });
    if (!removed) break;
  }

  // 8. Bỏ ảnh trùng liên tiếp (ảnh lazy + ảnh noscript)
  let lastSrc = "";
  $("img").each((_, el) => {
    const src = $(el).attr("src") ?? "";
    if (src === lastSrc) $(el).remove();
    lastSrc = src;
  });

  const images = [...new Set($("img").map((_, el) => $(el).attr("src") ?? "").get().filter(Boolean))];
  const textLength = $.root().text().replace(/\s+/g, "").length;
  const out = serializeXhtml($.root().contents().toArray() as AnyNode[]);

  return { html: out.trim(), images, textLength };
}

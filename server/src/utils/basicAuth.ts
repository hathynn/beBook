import { timingSafeEqual } from "crypto";
import { NextFunction, Request, Response } from "express";

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * Khoá cả trang bằng mật khẩu nếu đặt biến môi trường BASIC_AUTH="user:password".
 * Trình duyệt sẽ tự hiện hộp đăng nhập. Không đặt → web mở công khai.
 */
export function basicAuth() {
  const expected = process.env.BASIC_AUTH?.trim();
  return (req: Request, res: Response, next: NextFunction) => {
    if (!expected || req.path === "/api/health") return next();
    const header = req.headers.authorization ?? "";
    const given = header.startsWith("Basic ")
      ? Buffer.from(header.slice(6), "base64").toString("utf8")
      : "";
    if (given && safeEqual(given, expected)) return next();
    res.setHeader("WWW-Authenticate", 'Basic realm="beBook", charset="UTF-8"');
    res.status(401).send("Authentication required");
  };
}

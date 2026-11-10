import { NextFunction, Request, Response } from "express";

/**
 * Giới hạn số request theo IP (fixed window, lưu trong bộ nhớ).
 * Đủ cho 1 instance; nếu chạy nhiều instance cần chuyển sang Redis.
 */
export function rateLimit(opts: { windowMs: number; max: number; message: string }) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  setInterval(() => {
    const now = Date.now();
    for (const [key, v] of hits) if (v.resetAt <= now) hits.delete(key);
  }, opts.windowMs).unref();

  return (req: Request, res: Response, next: NextFunction) => {
    if (opts.max <= 0) return next(); // 0 = tắt giới hạn
    const key = req.ip ?? "unknown";
    const now = Date.now();
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + opts.windowMs };
      hits.set(key, entry);
    }
    entry.count++;
    res.setHeader("RateLimit-Limit", String(opts.max));
    res.setHeader("RateLimit-Remaining", String(Math.max(0, opts.max - entry.count)));
    if (entry.count > opts.max) {
      res.setHeader("Retry-After", String(Math.ceil((entry.resetAt - now) / 1000)));
      res.status(429).json({ message: opts.message });
      return;
    }
    next();
  };
}

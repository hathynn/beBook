import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import fs from "fs";
import path from "path";

import testRoute from "./routes/test.route";
import novelRoute from "./routes/novel.route";
import { AppError } from "./utils/errors";
import { basicAuth } from "./utils/basicAuth";

const app = express();

// Chạy sau proxy của Render/Railway/Nginx → lấy đúng IP người dùng cho rate limit
app.set("trust proxy", Number(process.env.TRUST_PROXY ?? 1));
app.disable("x-powered-by");

app.use(basicAuth());
app.use(cors({ exposedHeaders: ["Content-Disposition", "X-Bebook-Report"] }));
app.use(express.json({ limit: "100kb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});
app.use("/api/test", testRoute);
app.use("/api/novel", novelRoute);

app.use("/api", (_req, res) => {
  res.status(404).json({ message: "API endpoint not found." });
});

// ===========================
// Giao diện React đã build (frontend/dist) – deploy chung 1 service
// ===========================
const FRONTEND_DIST = process.env.FRONTEND_DIST ?? path.resolve(__dirname, "../../frontend/dist");
if (fs.existsSync(path.join(FRONTEND_DIST, "index.html"))) {
  app.use(express.static(FRONTEND_DIST, { index: false, maxAge: "1h" }));
  app.use((req, res, next) => {
    if (req.method !== "GET") return next();
    res.sendFile(path.join(FRONTEND_DIST, "index.html"));
  });
  console.log(`📦 Serving frontend from ${FRONTEND_DIST}`);
}

// Express 5 tự chuyển lỗi của async handler tới đây → luôn trả JSON { message }
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof AppError) {
    res.status(err.status).json({ message: err.message });
    return;
  }
  console.error(err);
  res.status(500).json({ message: "Something went wrong while processing this novel." });
});

export default app;

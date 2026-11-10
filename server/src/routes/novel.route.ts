import { Router } from "express";
import {
  createJob,
  downloadNovel,
  getChapter,
  getJob,
  getJobFile,
  getNovelChapters,
  getNovelInfo,
} from "../controllers/novel.controller";
import { rateLimit } from "../utils/rateLimit";

const router = Router();

const lookupLimit = rateLimit({
  windowMs: 10 * 60_000,
  max: Number(process.env.INFO_LIMIT_PER_10MIN ?? 40),
  message: "Too many requests. Please wait a few minutes and try again.",
});

const downloadLimit = rateLimit({
  windowMs: 60 * 60_000,
  max: Number(process.env.DOWNLOAD_LIMIT_PER_HOUR ?? 10),
  message: "You've generated too many EPUBs this hour. Please try again later.",
});

router.post("/info", lookupLimit, getNovelInfo);
router.post("/chapters", lookupLimit, getNovelChapters);
router.post("/chapter", lookupLimit, getChapter);

router.post("/jobs", downloadLimit, createJob);
router.get("/jobs/:id", getJob);
router.get("/jobs/:id/file", getJobFile);

router.post("/download", downloadLimit, downloadNovel);

export default router;

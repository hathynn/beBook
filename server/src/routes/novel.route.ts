import { Router } from "express";
import { downloadNovel, getChapter, getNovelChapters, getNovelInfo } from "../controllers/novel.controller";


const router = Router();

router.post("/info", getNovelInfo);
router.post("/chapters", getNovelChapters);
router.post("/chapter", getChapter);
router.post("/download", downloadNovel);

export default router;
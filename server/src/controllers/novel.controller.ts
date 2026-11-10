import { Request, Response } from "express";
import * as novelService from "../services/novel.service";
import * as downloadService from "../services/download.service";
import * as jobService from "../services/job.service";
import { DownloadReport } from "../services/download.service";

export const getNovelInfo = async (req: Request, res: Response) => {
  const url = novelService.validateUrl(req.body?.url);
  const passwords = novelService.normalizePasswords(req.body?.passwords);
  res.json(await novelService.getNovelInfo(url, passwords));
};

export const getNovelChapters = async (req: Request, res: Response) => {
  const url = novelService.validateUrl(req.body?.url);
  res.json(await novelService.getNovelChapters(url));
};

export const getChapter = async (req: Request, res: Response) => {
  const url = novelService.validateUrl(req.body?.url, false);
  const passwords = novelService.normalizePasswords(req.body?.passwords);
  res.json(await novelService.getChapter(url, passwords));
};

function sendEpub(res: Response, buffer: Buffer, fileName: string, report: DownloadReport) {
  const asciiName = fileName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(/"/g, "");

  res.setHeader("Content-Type", "application/epub+zip");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
  );
  res.setHeader("X-Bebook-Report", encodeURIComponent(JSON.stringify(report)));
  res.send(buffer);
}

/** Tạo EPUB đồng bộ trong 1 request (giữ lại cho tương thích / dùng bằng curl). */
export const downloadNovel = async (req: Request, res: Response) => {
  const url = novelService.validateUrl(req.body?.url);
  const passwords = novelService.normalizePasswords(req.body?.passwords);
  const { buffer, fileName, report } = await downloadService.downloadNovel(url, passwords);
  sendEpub(res, buffer, fileName, report);
};

// ===========================
// Job chạy nền: POST /jobs → GET /jobs/:id (tiến độ) → GET /jobs/:id/file
// ===========================
export const createJob = async (req: Request, res: Response) => {
  const url = novelService.validateUrl(req.body?.url);
  const passwords = novelService.normalizePasswords(req.body?.passwords);
  res.status(202).json(jobService.createJob(url, passwords, req.ip ?? "unknown"));
};

export const getJob = async (req: Request, res: Response) => {
  res.json(jobService.getJob(String(req.params.id)));
};

export const getJobFile = async (req: Request, res: Response) => {
  const { buffer, fileName, report } = jobService.getJobFile(String(req.params.id));
  sendEpub(res, buffer, fileName, report);
};

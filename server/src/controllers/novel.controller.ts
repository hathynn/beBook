import { Request, Response } from "express";
import * as novelService from "../services/novel.service";
import * as downloadService from "../services/download.service";

export const getNovelInfo = async (
  req: Request,
  res: Response
) => {
  const { url } = req.body;

  const result = await novelService.getNovelInfo(url);

  res.json(result);
};

export const getNovelChapters = async (
  req: Request,
  res: Response
) => {
  const { url } = req.body;

  const chapters = await novelService.getNovelChapters(url);

  res.json(chapters);
};

export const getChapter = async (
  req: Request,
  res: Response
) => {
  const { url } = req.body;

  const chapter = await novelService.getChapter(url);

  res.json(chapter);
};

// export const downloadNovel = async (
//   req: Request,
//   res: Response
// ) => {
//   const { url } = req.body;

//   const file = await downloadService.downloadNovel(url);

//   res.download(file);
// };

export const downloadNovel = async (
  req: Request,
  res: Response
) => {

  const { url } = req.body;

  const file = await downloadService.downloadNovel(url);

  res.download(file);

};
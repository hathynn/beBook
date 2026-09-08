import { useMutation } from "@tanstack/react-query";
import { fetchNovelInfo } from "../api/client";
import type { NovelInfo } from "../types/novel";

export function useNovelInfo() {
  return useMutation<NovelInfo, Error, string>({
    mutationFn: (url: string) => fetchNovelInfo(url),
  });
}

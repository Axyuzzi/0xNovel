import type { ConsumerChapterSummary } from "@0xnovelagent/shared/types/consumerWorkspace";

const chapterPrefixPattern = /^第\s*(?:\d+|[〇零一二两三四五六七八九十百千万]+)\s*章(?:\s*[·:：—-]\s*|\s*)/u;

export function chapterDirectoryLabel(
  chapter: Pick<ConsumerChapterSummary, "order" | "title">,
): string {
  const numberLabel = `第 ${chapter.order} 章`;
  const title = chapter.title.trim().replace(chapterPrefixPattern, "").trim();
  return title ? `${numberLabel} · ${title}` : numberLabel;
}

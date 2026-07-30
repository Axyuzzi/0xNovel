import type { PrismaClient } from "@prisma/client";
import { AppError } from "../../../middleware/errorHandler";

export class StreamingDraftWriter {
  private committedContent: string;
  private pendingContent = "";
  private draftRevision: number;
  private lastFlushAt = Date.now();

  constructor(
    private readonly db: PrismaClient,
    private readonly operationId: string,
    private readonly chapterId: string,
    initialContent: string,
    initialRevision: number,
    private readonly stage: "writing" | "continuing",
  ) {
    this.committedContent = initialContent;
    this.draftRevision = initialRevision;
  }

  async append(delta: string): Promise<void> {
    this.pendingContent += delta;
    if (this.pendingContent.length >= 80 || Date.now() - this.lastFlushAt >= 200) {
      await this.flush();
    }
  }

  async flush(): Promise<void> {
    if (!this.pendingContent) {
      return;
    }
    const nextContent = this.committedContent + this.pendingContent;
    const updated = await this.db.consumerChapterDraft.updateMany({
      where: {
        chapterId: this.chapterId,
        revision: this.draftRevision,
      },
      data: {
        content: nextContent,
        source: "ai_stream",
        revision: { increment: 1 },
      },
    });
    if (updated.count !== 1) {
      throw new AppError(
        "正文在生成期间被修改，已停止写入以保护当前内容。",
        409,
      );
    }
    this.draftRevision += 1;
    this.committedContent = nextContent;
    this.pendingContent = "";
    this.lastFlushAt = Date.now();
    await this.db.consumerCreationOperation.update({
      where: { id: this.operationId },
      data: {
        status: "running",
        stage: this.stage,
        receivedContent: nextContent,
      },
    });
  }

  async finish(content: string): Promise<string> {
    this.pendingContent = "";
    if (content === this.committedContent) {
      return content;
    }
    const updated = await this.db.consumerChapterDraft.updateMany({
      where: {
        chapterId: this.chapterId,
        revision: this.draftRevision,
      },
      data: {
        content,
        source: "ai_generated",
        revision: { increment: 1 },
      },
    });
    if (updated.count !== 1) {
      throw new AppError(
        "正文在生成完成前被修改，已保留用户当前内容。",
        409,
      );
    }
    this.draftRevision += 1;
    this.committedContent = content;
    return content;
  }

  currentContent(): string {
    return this.committedContent + this.pendingContent;
  }
}

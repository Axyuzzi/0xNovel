import type { PrismaClient } from "@prisma/client";

export class StreamingOperationWriter {
  private committedContent: string;
  private pendingContent = "";
  private lastFlushAt = Date.now();

  constructor(
    private readonly db: PrismaClient,
    private readonly operationId: string,
    initialContent = "",
  ) {
    this.committedContent = initialContent;
  }

  async append(delta: string): Promise<void> {
    this.pendingContent += delta;
    if (this.pendingContent.length >= 400 || Date.now() - this.lastFlushAt >= 500) {
      await this.flush();
    }
  }

  async flush(): Promise<void> {
    if (!this.pendingContent) return;
    this.committedContent += this.pendingContent;
    this.pendingContent = "";
    this.lastFlushAt = Date.now();
    await this.db.consumerCreationOperation.updateMany({
      where: { id: this.operationId, status: "running" },
      data: { receivedContent: this.committedContent },
    });
  }

  async finish(content: string): Promise<string> {
    this.pendingContent = "";
    this.committedContent = content;
    await this.db.consumerCreationOperation.updateMany({
      where: { id: this.operationId, status: "running" },
      data: { receivedContent: content },
    });
    return content;
  }

  currentContent(): string {
    return this.committedContent + this.pendingContent;
  }
}

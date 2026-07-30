import type { PrismaClient } from "@prisma/client";

const WRITE_INTERVAL_MS = 250;
const WRITE_CHARS = 160;

export class SetupPreviewWriter {
  private content = "";
  private lastWriteAt = 0;
  private lastWriteLength = 0;

  constructor(
    private readonly db: PrismaClient,
    private readonly operationId: string,
    private readonly enabled: boolean,
  ) {}

  async append(content: string): Promise<void> {
    if (!this.enabled || !content) {
      return;
    }
    this.content += content;
    await this.persist(false);
  }

  async flush(): Promise<void> {
    await this.persist(true);
  }

  private async persist(force: boolean): Promise<void> {
    if (!this.enabled || this.content.length === this.lastWriteLength) {
      return;
    }
    const now = Date.now();
    const enoughTimePassed = now - this.lastWriteAt >= WRITE_INTERVAL_MS;
    const enoughContentArrived = this.content.length - this.lastWriteLength >= WRITE_CHARS;
    if (!force && !enoughTimePassed && !enoughContentArrived) {
      return;
    }

    try {
      const written = await this.db.consumerCreationOperation.updateMany({
        where: { id: this.operationId, status: "running" },
        data: { receivedContent: this.content },
      });
      if (written.count === 1) {
        this.lastWriteAt = now;
        this.lastWriteLength = this.content.length;
      }
    } catch {
      // 预览属于非关键投影，写入失败不能中断或重放已经计费的正式生成。
    }
  }
}

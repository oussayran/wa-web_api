import type { Logger } from 'pino';
import type { PrismaClient } from '@prisma/client';

export class RetentionService {
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly retentionDays: number,
    private readonly idempotencyHours: number,
    private readonly logger: Logger,
  ) {}

  async cleanup(): Promise<void> {
    const contentCutoff = new Date(Date.now() - this.retentionDays * 86_400_000);
    const idempotencyCutoff = new Date(Date.now() - this.idempotencyHours * 3_600_000);
    const [content, sessions] = await this.prisma.$transaction([
      this.prisma.message.updateMany({
        where: {
          createdAt: { lt: contentCutoff },
          OR: [{ textPreview: { not: null } }, { encryptedText: { not: null } }],
        },
        data: { textPreview: null, encryptedText: null },
      }),
      this.prisma.adminSession.deleteMany({ where: { expiresAt: { lt: new Date() } } }),
    ]);
    const expiredKeys = await this.prisma.message.findMany({
      where: { createdAt: { lt: idempotencyCutoff }, idempotencyKey: { not: { startsWith: 'expired:' } } },
      select: { id: true },
    });
    await this.prisma.$transaction(
      expiredKeys.map(({ id }) => this.prisma.message.update({
        where: { id },
        data: { idempotencyKey: `expired:${id}` },
      })),
    );
    this.logger.info(
      { cleanedMessageContents: content.count, expiredIdempotencyKeys: expiredKeys.length, expiredSessions: sessions.count },
      'Retention cleanup completed',
    );
  }

  start(): void {
    void this.cleanup().catch((error: unknown) => this.logger.error({ err: error }, 'Initial retention cleanup failed'));
    this.timer = setInterval(() => {
      void this.cleanup().catch((error: unknown) => this.logger.error({ err: error }, 'Retention cleanup failed'));
    }, 24 * 60 * 60 * 1000);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }
}

import type { Prisma, PrismaClient } from '@prisma/client';
import { redactSensitiveData } from '../utils/redaction.js';

export interface AuditEntry {
  adminUserId?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  safeMetadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export class AuditService {
  constructor(private readonly prisma: PrismaClient) {}

  async record(entry: AuditEntry): Promise<void> {
    const metadata = entry.safeMetadata
      ? (redactSensitiveData(entry.safeMetadata) as Prisma.InputJsonValue)
      : undefined;
    await this.prisma.auditLog.create({
      data: {
        action: entry.action,
        ...(entry.adminUserId ? { adminUserId: entry.adminUserId } : {}),
        ...(entry.entityType ? { entityType: entry.entityType } : {}),
        ...(entry.entityId ? { entityId: entry.entityId } : {}),
        ...(metadata ? { safeMetadata: metadata } : {}),
        ...(entry.ipAddress ? { ipAddress: entry.ipAddress } : {}),
        ...(entry.userAgent ? { userAgent: entry.userAgent.slice(0, 500) } : {}),
      },
    });
  }
}

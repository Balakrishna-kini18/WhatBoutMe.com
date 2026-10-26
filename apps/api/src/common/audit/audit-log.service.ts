import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { Prisma } from '@prisma/client';

export interface AuditLogOptions {
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  reason?: string;
  metadata?: Record<string, any>;
  requireReason?: boolean;
}

@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Actions that strictly require a non-empty reason per PDF specification (Pages 4, 8, 10, 13) and AGENTS.md.
   */
  private static readonly REASON_REQUIRED_ACTIONS = new Set<string>([
    // Step progression overrides (PDF Pages 4 & 8)
    'STEP_MANUAL_UNLOCKED',
    'STEP_MANUAL_LOCKED',
    'STEP_OVERRIDE_RESET',
    'STEP_UNLOCK_OVERRIDE',
    'STEP_LOCK_OVERRIDE',

    // Attendance manual corrections & reconciliation (PDF Pages 4 & 10)
    'ATTENDANCE_MANUAL_OVERRIDE',
    'ATTENDANCE_CORRECTED',
    'ATTENDANCE_RECONCILED',
    'ATTENDANCE_UNMATCHED_LINKED',

    // Certificate approvals, rejections, revocations (PDF Page 4)
    'CERTIFICATE_APPROVAL',
    'CERTIFICATE_APPROVED',
    'CERTIFICATE_REJECTION',
    'CERTIFICATE_REJECTED',
    'CERTIFICATE_REVOCATION',
    'CERTIFICATE_REVOKED',

    // Enrolment & Quiz / Exam status overrides (PDF Page 4)
    'ENROLMENT_STATUS_OVERRIDE',
    'QUIZ_OVERRIDE',
    'EXAM_ATTEMPT_RESET',
    'EXAM_ATTEMPTS_RESET',

    // Invoices, refunds, and financial adjustments (PDF Page 4)
    'CREATE_CREDIT_NOTE',
    'REFUND_ISSUED',
  ]);

  /**
   * Redacts any credential or token keys from metadata before writing to the database.
   */
  private static sanitizeMetadata(obj: any): any {
    if (!obj || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map((item) => AuditLogService.sanitizeMetadata(item));
    const clean: Record<string, any> = {};
    const sensitiveKeys = /^(password|token|secret|jwt|hash|refreshToken|pin|otp)$/i;
    for (const [key, val] of Object.entries(obj)) {
      if (sensitiveKeys.test(key)) {
        clean[key] = '[REDACTED]';
      } else if (val && typeof val === 'object') {
        clean[key] = AuditLogService.sanitizeMetadata(val);
      } else {
        clean[key] = val;
      }
    }
    return clean;
  }

  /**
   * Records an immutable audit log entry inside the provided database transaction (or default prisma instance).
   * Enforces non-empty reason validation whenever required.
   */
  async log(
    txOrPrisma: Prisma.TransactionClient | PrismaService | undefined,
    options: AuditLogOptions,
  ) {
    const client = txOrPrisma || this.prisma;
    const { actorId, action, entityType, entityId, metadata = {} } = options;

    if (!actorId) {
      throw new BadRequestException('Audit log requires a valid actor ID');
    }

    const mustRequireReason =
      options.requireReason ?? AuditLogService.REASON_REQUIRED_ACTIONS.has(action);

    const reason = options.reason?.trim();
    if (mustRequireReason && (!reason || reason.length === 0)) {
      throw new BadRequestException(
        `Action "${action}" requires a mandatory non-empty reason for audit compliance`,
      );
    }

    const cleanedMeta = AuditLogService.sanitizeMetadata(metadata);
    const finalMeta = {
      ...cleanedMeta,
      ...(reason ? { reason } : {}),
      recordedAtUtc: new Date().toISOString(),
    };

    return (client as any).auditLog.create({
      data: {
        actorId,
        action,
        entity: entityType,
        entityId,
        meta: finalMeta,
      },
    });
  }

  /**
   * Helper that executes an operation inside a database transaction while providing
   * an audit logging helper bound to the active transaction.
   */
  async executeWithAudit<T>(
    actorId: string,
    operation: (
      tx: Prisma.TransactionClient,
      log: (opts: Omit<AuditLogOptions, 'actorId'>) => Promise<any>,
    ) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      const logAudit = (opts: Omit<AuditLogOptions, 'actorId'>) =>
        this.log(tx, { ...opts, actorId });

      return operation(tx, logAudit);
    });
  }
}

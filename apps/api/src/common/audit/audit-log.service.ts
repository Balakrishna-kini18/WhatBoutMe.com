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
   * Actions that strictly require a non-empty reason.
   */
  private static readonly REASON_REQUIRED_ACTIONS = new Set<string>([
    'ATTENDANCE_MANUAL_OVERRIDE',
    'ATTENDANCE_CORRECTED',
    'ATTENDANCE_RECONCILED',
    'ATTENDANCE_UNMATCHED_LINKED',
    'CERTIFICATE_APPROVAL',
    'CERTIFICATE_REJECTION',
    'CERTIFICATE_REVOCATION',
    'ENROLMENT_STATUS_OVERRIDE',
    'EXAM_ATTEMPT_RESET',
  ]);

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

    const finalMeta = {
      ...metadata,
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

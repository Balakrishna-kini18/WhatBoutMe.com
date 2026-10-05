import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  async logAction(params: {
    actorId?: string;
    action: string;
    entity: string;
    entityId: string;
    meta?: any;
    ip?: string;
  }) {
    return this.auditLog.create({
      data: {
        actorId: params.actorId,
        action: params.action,
        entity: params.entity,
        entityId: params.entityId,
        meta: params.meta,
        ip: params.ip,
      }
    });
  }
}

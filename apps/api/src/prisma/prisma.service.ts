import { Injectable, OnModuleInit, OnModuleDestroy, Scope } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

export let queryCount = 0;
export const resetQueryCount = () => { queryCount = 0; };

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({
      log: [
        { emit: 'event', level: 'query' },
      ],
    });
  }

  async onModuleInit() {
    await this.$connect();
    // @ts-ignore
    this.$on('query', (e) => {
      queryCount++;
    });
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

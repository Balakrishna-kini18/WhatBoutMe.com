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
    const isWorkerMode = process.env.WORKER_MODE === 'true';
    // Long-running BullMQ workers must fail-fast at boot if DB is unreachable.
    // Serverless API functions: Prisma auto-lazy-connects on the first query
    // (e.g. HealthController / real endpoint).  Skipping eager connect here
    // removes the 3-attempt × 1s retry delay (~2s+ idle stall) from cold start
    // and avoids Prisma DNS/connect hangs blocking Vercel invocation.
    if (!isWorkerMode) {
      try {
        // @ts-ignore
        this.$on('query', (e) => {
          queryCount++;
        });
      } catch {}
      return;
    }
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await this.$connect();
        break;
      } catch (err: any) {
        console.warn(`[PrismaService] Database connection attempt ${attempt} notice: ${err?.message || err}`);
        if (attempt === 3) {
          console.warn('[PrismaService] Proceeding with lazy connection on incoming requests.');
        } else {
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
    }
    try {
      // @ts-ignore
      this.$on('query', (e) => {
        queryCount++;
      });
    } catch {}
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

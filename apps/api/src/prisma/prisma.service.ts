import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { recordDbDuration } from '../common/timing/server-timing.storage.js';

export let queryCount = 0;
export const resetQueryCount = () => { queryCount = 0; };

declare global {
  // eslint-disable-next-line no-var
  var __prismaServiceInstance: PrismaService | undefined;
  // eslint-disable-next-line no-var
  var __prismaClientInstance: PrismaClient | undefined;
}

/**
 * Configures connection pooling and PgBouncer parameters appropriate for a free-tier database.
 * Free-tier databases (e.g. Neon, Supabase) have strict connection limits and cold-start latency.
 * This ensures:
 * - Connection limit capped (default 10 in prod, 5 in dev/test, or DB_POOL_MAX)
 * - Connect timeout (default 15s to withstand cold starts, or DB_CONNECT_TIMEOUT)
 * - Pool timeout (default 10s to fail gracefully rather than stall, or DB_POOL_TIMEOUT)
 * - PgBouncer mode enabled when pooled host (-pooler) is detected
 */
export function buildPooledDatabaseUrl(rawUrl?: string): string | undefined {
  if (!rawUrl) return rawUrl;
  try {
    const url = new URL(rawUrl);
    if (!url.protocol.startsWith('postgres')) {
      return rawUrl;
    }

    const poolMax = process.env.DB_POOL_MAX || (process.env.NODE_ENV === 'production' ? '10' : '5');
    const connectTimeout = process.env.DB_CONNECT_TIMEOUT || '15';
    const poolTimeout = process.env.DB_POOL_TIMEOUT || '10';

    if (!url.searchParams.has('connection_limit')) {
      url.searchParams.set('connection_limit', poolMax);
    }
    if (!url.searchParams.has('connect_timeout')) {
      url.searchParams.set('connect_timeout', connectTimeout);
    }
    if (!url.searchParams.has('pool_timeout')) {
      url.searchParams.set('pool_timeout', poolTimeout);
    }

    // Support PgBouncer / Transaction pooler if host indicates a pooler endpoint or pgbouncer env is set
    const isPoolerHost = url.hostname.includes('-pooler') || url.hostname.includes('pooler') || url.port === '6543';
    if ((isPoolerHost || process.env.DB_PGBOUNCER === 'true') && !url.searchParams.has('pgbouncer')) {
      url.searchParams.set('pgbouncer', 'true');
    }

    return url.toString();
  } catch {
    return rawUrl;
  }
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    if (globalThis.__prismaServiceInstance) {
      return globalThis.__prismaServiceInstance;
    }

    const configuredUrl = buildPooledDatabaseUrl(process.env.DATABASE_URL);
    super({
      datasources: configuredUrl
        ? {
            db: {
              url: configuredUrl,
            },
          }
        : undefined,
      log: [
        { emit: 'event', level: 'query' },
      ],
    });

    globalThis.__prismaServiceInstance = this;
    globalThis.__prismaClientInstance = this;

    if (typeof (this as any).$use === 'function') {
      (this as any).$use(async (params: any, next: any) => {
        const start = performance.now();
        const result = await next(params);
        const dur = Math.round((performance.now() - start) * 10) / 10;
        recordDbDuration(dur);
        if (dur > 300) {
          const model = params.model ? `${params.model}.` : '';
          console.warn(`[Prisma] Slow Query Warning: ${model}${params.action} took ${dur}ms`);
        }
        return result;
      });
    }
  }

  async onModuleInit() {
    const isWorkerMode = process.env.WORKER_MODE === 'true';
    // Long-running BullMQ workers must fail-fast at boot if DB is unreachable.
    // Serverless API functions: Prisma auto-lazy-connects on the first query
    // (e.g. HealthController / real endpoint). Skipping eager connect here
    // removes the 3-attempt × 1s retry delay (~2s+ idle stall) from cold start
    // and avoids Prisma DNS/connect hangs blocking Vercel invocation.
    if (!isWorkerMode) {
      try {
        // @ts-ignore
        this.$on('query', (e: any) => {
          queryCount++;
          if (e?.duration && e.duration > 300) {
            console.warn(`[Prisma] Slow Query Warning: ${e.duration}ms - ${e?.query ?? ''}`);
          }
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
      this.$on('query', (e: any) => {
        queryCount++;
        if (e?.duration && e.duration > 300) {
          console.warn(`[Prisma] Slow Query Warning: ${e.duration}ms - ${e?.query ?? ''}`);
        }
      });
    } catch {}
  }

  async onModuleDestroy() {
    if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
      return;
    }
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

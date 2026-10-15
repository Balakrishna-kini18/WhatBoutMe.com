import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Lightweight keep-alive & warmup endpoint for marketing app.
 * Executes SELECT 1 to prevent free-tier DB sleep.
 */
export async function GET() {
  const start = Date.now();
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({
      status: 'ok',
      service: 'marketing-keepalive',
      database: 'connected',
      latencyMs: Date.now() - start,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        status: 'error',
        service: 'marketing-keepalive',
        database: 'disconnected',
        error: error?.message || String(error),
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}

import './instrument.js'; // Must be first!
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import express from 'express';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';
import { QueryCountInterceptor } from './common/interceptors/query-count.interceptor.js';
import { UPLOAD_DIR } from './modules/website/storage.js';
import { RedisIoAdapter } from './common/adapters/redis-io.adapter.js';
import { SentryGlobalFilter } from '@sentry/nestjs/setup';
import { Logger } from 'nestjs-pino';

async function bootstrap() {
  if (process.env.NODE_ENV === 'production' && process.env.PAYMENT_MODE === 'mock') {
    console.error('FATAL ERROR: API refuses to start with PAYMENT_MODE=mock in production');
    process.exit(1);
  }

  const app = await NestFactory.create(AppModule, { rawBody: true, bufferLogs: true });
  app.useLogger(app.get(Logger));
  
  // Security
  // @ts-ignore - Ignore TS2349: This expression is not callable
  app.use(helmet());
  const allowedOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
    : []; // Don't rely exclusively on localhost, though we keep the regex below for local dev

  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      // Allow requests with no origin (like mobile apps, curl, or server-to-server)
      if (!origin) return callback(null, true);
      if (
        allowedOrigins.includes(origin) ||
        /^http:\/\/localhost:[0-9]+$/.test(origin) ||
        /^http:\/\/127\.0\.0\.1:[0-9]+$/.test(origin) ||
        /\.vercel\.app$/.test(origin) || // <-- Automatically allow ALL Vercel domains
        // development only: a phone on the same network opening the apps at
        // this machine's private address (10.x, 172.16-31.x, 192.168.x)
        (process.env.NODE_ENV !== 'production' &&
          /^http:\/\/(10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+):[0-9]+$/.test(origin))
      ) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    exposedHeaders: ['Server-Timing', 'X-Prisma-Queries', 'Cache-Control'],
  });


  
  // Uploaded files: served publicly (images load from the website and the
  // portals, so other origins must be allowed to embed them), and received as
  // a raw body by POST /uploads.
  app.use(
    '/uploads',
    (_req: express.Request, res: express.Response, next: express.NextFunction) => {
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      next();
    },
    express.static(UPLOAD_DIR, { index: false, maxAge: '7d' }),
    express.raw({ type: () => true, limit: '25mb' }),
  );

  // Body limit
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ limit: '10mb', extended: true }));

  // Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Exception Filter
  app.useGlobalFilters(
    new SentryGlobalFilter(),
    new HttpExceptionFilter()
  );

  app.useGlobalInterceptors(new QueryCountInterceptor());

  // Realtime Socket.IO Redis Adapter
  try {
    const redisIoAdapter = new RedisIoAdapter(app);
    await redisIoAdapter.connectToRedis();
    app.useWebSocketAdapter(redisIoAdapter);
  } catch (err: any) {
    console.warn('[main] Redis WebSocket adapter initialization warning:', err?.message);
  }

  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 4000;
  await app.listen(port);
}
await bootstrap();

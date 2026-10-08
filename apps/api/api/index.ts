import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import express from 'express';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter.js';
import { AppModule } from '../src/app.module.js';

let cachedServer: any;

async function bootstrapServer() {
  if (process.env.NODE_ENV === 'production' && process.env.PAYMENT_MODE === 'mock') {
    throw new Error('FATAL ERROR: API refuses to start with PAYMENT_MODE=mock in production');
  }

  if (!cachedServer) {
    const expressApp = express();
    const nestApp = await NestFactory.create(
      AppModule,
      new ExpressAdapter(expressApp),
    );
    
    nestApp.use(helmet());
    const allowedOrigins = process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
      : []; // Don't rely exclusively on localhost, though we keep the regex below for local dev

    nestApp.enableCors({
      origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
        if (!origin) return callback(null, true);
        if (
          allowedOrigins.includes(origin) ||
          /^http:\/\/localhost:[0-9]+$/.test(origin) ||
          /^http:\/\/127\.0\.0\.1:[0-9]+$/.test(origin) ||
          /\.vercel\.app$/.test(origin) // <-- Automatically allow ALL Vercel domains (preview & production)
        ) {
          return callback(null, true);
        }
        return callback(new Error('Not allowed by CORS'));
      },
      credentials: true,
    });
    
    nestApp.use(express.json({ limit: '10mb' }));
    nestApp.use(express.urlencoded({ limit: '10mb', extended: true }));
    
    nestApp.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    
    nestApp.useGlobalFilters(new HttpExceptionFilter());

    await nestApp.init();
    cachedServer = expressApp;
  }
  return cachedServer;
}

export default async (req: any, res: any) => {
  const app = await bootstrapServer();
  return app(req, res);
};

import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import serverlessExpress from '@vendia/serverless-express';
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
    nestApp.enableCors({
      origin: process.env.CORS_ORIGIN || ['http://localhost:3000', 'http://localhost:3002'],
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
    cachedServer = (serverlessExpress as any)({ app: expressApp });
  }
  return cachedServer;
}

export default async (req: any, res: any) => {
  const server = await bootstrapServer();
  return server(req, res);
};

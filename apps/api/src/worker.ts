process.env.WORKER_MODE = 'true';

import './instrument.js'; // Must be first!
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { Logger } from 'nestjs-pino';

async function bootstrap() {
  if (process.env.NODE_ENV === 'production' && process.env.PAYMENT_MODE === 'mock') {
    console.error('FATAL ERROR: Worker refuses to start with PAYMENT_MODE=mock in production');
    process.exit(1);
  }

  // Create a headless application context (no HTTP/Express server)
  const app = await NestFactory.createApplicationContext(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  
  app.enableShutdownHooks();

  const logger = app.get(Logger);
  logger.log('BullMQ Background Worker initialized and waiting for jobs...');
}
bootstrap().catch(err => {
  console.error(err);
  process.exit(1);
});

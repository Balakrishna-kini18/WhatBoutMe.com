import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  if (process.env.NODE_ENV === 'production' && process.env.PAYMENT_MODE === 'mock') {
    console.error('FATAL ERROR: Worker refuses to start with PAYMENT_MODE=mock in production');
    process.exit(1);
  }

  // Create a headless application context (no HTTP/Express server)
  const app = await NestFactory.createApplicationContext(AppModule);
  
  app.enableShutdownHooks();

  console.log('BullMQ Background Worker initialized and waiting for jobs...');
}
bootstrap();

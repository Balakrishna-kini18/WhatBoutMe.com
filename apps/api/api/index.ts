let cachedServer: any;

async function bootstrapServer() {
  if (process.env.NODE_ENV === 'production' && process.env.PAYMENT_MODE === 'mock') {
    throw new Error('FATAL ERROR: API refuses to start with PAYMENT_MODE=mock in production');
  }

  if (!cachedServer) {
    // Dynamically import everything so top-level module load errors are caught
    await import('../src/instrument.js');
    
    const { NestFactory } = await import('@nestjs/core');
    const { ExpressAdapter } = await import('@nestjs/platform-express');
    const express = (await import('express')).default;
    const { ValidationPipe } = await import('@nestjs/common');
    const helmet = (await import('helmet')).default;
    const { HttpExceptionFilter } = await import('../src/common/filters/http-exception.filter.js');
    const { AppModule } = await import('../src/app.module.js');

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
  try {
    const app = await bootstrapServer();
    return new Promise<void>((resolve, reject) => {
      res.on('finish', () => resolve());
      res.on('close', () => resolve());
      res.on('error', (err: any) => reject(err));
      app(req, res, (err: any) => {
        if (err) return reject(err);
        resolve();
      });
    });
  } catch (err: any) {
    console.error('FATAL SERVERLESS BOOTSTRAP ERROR:', err);
    if (!res.headersSent) {
      res.status(500).json({
        statusCode: 500,
        error: 'Serverless Bootstrap Error',
        message: err?.message || String(err),
        stack: err?.stack,
      });
    }
  }
};

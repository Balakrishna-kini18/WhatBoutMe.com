import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { ProgramsModule } from './modules/programs/programs.module.js';
import { BatchesModule } from './modules/batches/batches.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { QuizzesModule } from './modules/quizzes/quizzes.module.js';
import { InvoicesModule } from './modules/invoices/invoices.module.js';
import { RevenueModule } from './modules/revenue/revenue.module.js';
import { SessionsModule } from './modules/sessions/sessions.module.js';
import { CertificatesModule } from './modules/certificates/certificates.module.js';
import { EnrollmentsModule } from './modules/enrollments/enrollments.module.js';
import { WebsiteModule } from './modules/website/website.module.js';
import { CloudinaryModule } from './modules/cloudinary/cloudinary.module.js';
import { QueueModule } from './modules/queue/queue.module.js';
import { RedisGlobalModule } from './common/redis/redis.module.js';
import { EmailModule } from './modules/email/email.module.js';
import { ZoomModule } from './modules/zoom/zoom.module.js';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';

import { APP_GUARD, Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './modules/auth/jwt-auth.guard.js';
import { RolesGuard } from './common/guards/roles.guard.js';

import { UpstashThrottlerStorage } from './common/throttler/upstash.storage.js';

@Module({
  imports: [
    PrismaModule,
    ThrottlerModule.forRootAsync({
      useFactory: () => ({
        throttlers: [
          {
            name: 'default',
            ttl: 60000,
            limit: 300, // 300 reqs / min; three apps share one address in an office
          }
        ],
        // Shared Redis counter when configured; otherwise the built-in in-memory
        // counter, so the API still runs locally without Upstash credentials.
        storage: process.env.UPSTASH_REDIS_REST_URL
          ? new UpstashThrottlerStorage()
          : undefined,
      }),
    }),
    UsersModule,
    ProgramsModule,
    BatchesModule,
    AuthModule,
    QuizzesModule,
    InvoicesModule,
    RevenueModule,
    SessionsModule,
    CertificatesModule,
    EnrollmentsModule,
    WebsiteModule,
    CloudinaryModule,
    RedisGlobalModule,
    QueueModule,
    EmailModule,
    ZoomModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    Reflector
  ],
})
export class AppModule {}

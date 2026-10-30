import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ServerTimingMiddleware } from './common/middleware/server-timing.middleware.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { ProgramsModule } from './modules/programs/programs.module.js';
import { BatchesModule } from './modules/batches/batches.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { QuizzesModule } from './modules/quizzes/quizzes.module.js';
import { ExamsModule } from './modules/exams/exams.module.js';
import { OralAssessmentsModule } from './modules/oral-assessments/oral-assessments.module.js';
import { InvoicesModule } from './modules/invoices/invoices.module.js';
import { RevenueModule } from './modules/revenue/revenue.module.js';
import { SessionsModule } from './modules/sessions/sessions.module.js';
import { CertificatesModule } from './modules/certificates/certificates.module.js';
import { EnrollmentsModule } from './modules/enrollments/enrollments.module.js';
import { ProgressionModule } from './modules/progression/progression.module.js';
import { AgreementsModule } from './modules/agreements/agreements.module.js';
import { WebsiteModule } from './modules/website/website.module.js';
import { CloudinaryModule } from './modules/cloudinary/cloudinary.module.js';
import { QueueModule } from './modules/queue/queue.module.js';
import { RedisGlobalModule } from './common/redis/redis.module.js';
import { EmailModule } from './modules/email/email.module.js';
import { ZoomModule } from './modules/zoom/zoom.module.js';
import { RealtimeModule } from './modules/realtime/realtime.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { ChatModule } from './modules/chat/chat.module.js';
import { ReportsModule } from './modules/reports/reports.module.js';
import { ResourcesModule } from './modules/resources/resources.module.js';
import { CouponsModule } from './modules/coupons/coupons.module.js';
import { EventsModule } from './modules/events/events.module.js';
import { GalleryModule } from './modules/gallery/gallery.module.js';
import { PaymentsModule } from './modules/payments/payments.module.js';
import { OrganizationsModule } from './modules/organizations/organizations.module.js';
import { NotesModule } from './modules/notes/notes.module.js';
import { MissionStatementsModule } from './modules/mission-statements/mission-statements.module.js';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { SentryModule } from '@sentry/nestjs/setup';
import { CacheHelperModule } from './common/cache/cache-helper.module.js';
import { AuditModule } from './common/audit/audit.module.js';

import { APP_GUARD, APP_INTERCEPTOR, Reflector } from '@nestjs/core';
import { CacheControlInterceptor } from './common/interceptors/cache-control.interceptor.js';
import { JwtAuthGuard } from './modules/auth/jwt-auth.guard.js';
import { RolesGuard } from './common/guards/roles.guard.js';
import { PermissionsGuard } from './common/guards/permissions.guard.js';

import { UpstashThrottlerStorage } from './common/throttler/upstash.storage.js';

@Module({
  imports: [
    SentryModule.forRoot(),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV !== 'production' ? 'debug' : 'info',
        transport: process.env.NODE_ENV !== 'production'
          ? { target: 'pino-pretty', options: { singleLine: true } }
          : undefined,
        autoLogging: false,
      },
    }),
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
          ? (new UpstashThrottlerStorage() as any)
          : undefined,
      }),
    }),
    UsersModule,
    ProgramsModule,
    BatchesModule,
    AuthModule,
    QuizzesModule,
    ExamsModule,
    OralAssessmentsModule,
    InvoicesModule,
    RevenueModule,
    SessionsModule,
    CertificatesModule,
    EnrollmentsModule,
    ProgressionModule,
    AgreementsModule,
    WebsiteModule,
    CloudinaryModule,
    CacheHelperModule,
    RedisGlobalModule,
    QueueModule,
    EmailModule,
    ZoomModule,
    RealtimeModule,
    HealthModule,
    ChatModule,
    ReportsModule,
    AuditModule,
    ResourcesModule,
    CouponsModule,
    EventsModule,
    GalleryModule,
    PaymentsModule,
    OrganizationsModule,
    NotesModule,
    MissionStatementsModule,
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
      useClass: PermissionsGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: CacheControlInterceptor,
    },
    Reflector
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(ServerTimingMiddleware).forRoutes('*');
  }
}

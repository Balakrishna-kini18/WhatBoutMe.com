import { Module, Global } from '@nestjs/common';
import { AuditLogService } from './audit-log.service.js';
import { PrismaModule } from '../../prisma/prisma.module.js';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [AuditLogService],
  exports: [AuditLogService],
})
export class AuditModule {}

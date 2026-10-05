import { Module } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway.js';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { JwtModule } from '@nestjs/jwt';

@Module({
  imports: [PrismaModule, AuthModule, JwtModule],
  providers: [RealtimeGateway],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}

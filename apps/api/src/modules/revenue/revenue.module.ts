import { Module } from '@nestjs/common';
import { RevenueController } from './revenue.controller.js';
import { PrismaModule } from '../../prisma/prisma.module.js';

@Module({
  imports: [PrismaModule],
  controllers: [RevenueController],
})
export class RevenueModule {}

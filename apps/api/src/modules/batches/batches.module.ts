import { Module } from '@nestjs/common';
import { BatchesController } from './batches.controller.js';
import { BatchesService } from './batches.service.js';

import { BatchAccessGuard } from '../../common/guards/batch-access.guard.js';

@Module({
  controllers: [BatchesController],
  providers: [BatchesService, BatchAccessGuard],
  exports: [BatchesService],
})
export class BatchesModule {}

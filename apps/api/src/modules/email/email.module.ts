import { Global, Module } from '@nestjs/common';
import { EmailService } from './email.service.js';
import { EmailProcessor } from './email.processor.js';

const isWorkerMode = process.env.WORKER_MODE === 'true';

@Global()
@Module({
  providers: [
    EmailService,
    ...(isWorkerMode ? [EmailProcessor] : []),
  ],
  exports: [EmailService],
})
export class EmailModule {}

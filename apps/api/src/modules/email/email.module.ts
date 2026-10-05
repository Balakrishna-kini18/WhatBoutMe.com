import { Global, Module } from '@nestjs/common';
import { EmailService } from './email.service.js';
import { EmailProcessor } from './email.processor.js';

@Global()
@Module({
  providers: [EmailService, EmailProcessor],
  exports: [EmailService],
})
export class EmailModule {}

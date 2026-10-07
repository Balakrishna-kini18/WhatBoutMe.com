import { Module } from '@nestjs/common';
import { ChatService } from './chat.service.js';
import { ChatController } from './chat.controller.js';

@Module({
  providers: [ChatService],
  controllers: [ChatController],
})
export class ChatModule {}

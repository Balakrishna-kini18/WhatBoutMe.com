import { Controller, Post, Get, Patch, Body, Param, Req, UseGuards } from '@nestjs/common';
import { ChatService } from './chat.service.js';
import { CreateConversationDto, SendMessageDto, UpdateConversationStatusDto } from './dto/chat.dto.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';

@UseGuards(JwtAuthGuard)
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('conversations')
  async startConversation(@Req() req: any, @Body() dto: CreateConversationDto) {
    return this.chatService.startConversation(req.user.userId, dto.batchId, dto.initialMessage);
  }

  @Get('conversations')
  async getConversations(@Req() req: any) {
    return this.chatService.getConversations(req.user.userId);
  }

  @Post('conversations/:id/messages')
  async sendMessage(
    @Req() req: any,
    @Param('id') conversationId: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.chatService.sendMessage(conversationId, req.user.userId, dto.content, dto.attachmentUrl);
  }

  @Get('conversations/:id/messages')
  async getMessages(@Req() req: any, @Param('id') conversationId: string) {
    return this.chatService.getMessages(conversationId, req.user.userId);
  }

  @Patch('conversations/:id/status')
  async updateStatus(
    @Req() req: any,
    @Param('id') conversationId: string,
    @Body() dto: UpdateConversationStatusDto,
  ) {
    return this.chatService.updateStatus(conversationId, req.user.userId, req.user.role, dto.status);
  }
}

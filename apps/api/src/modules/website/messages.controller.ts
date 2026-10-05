import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Request,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service.js';

export class SendMessageDto {
  @IsString() @IsNotEmpty() @MaxLength(4000) content: string;
}

/**
 * Direct messages between a learner and the programme team.
 * Learners see their own conversations; staff see every conversation so the
 * inbox can be shared between admins and managers.
 */
@Controller('messages')
export class MessagesController {
  constructor(private prisma: PrismaService) {}

  private isStaff(user: any) {
    return user.role !== Role.USER;
  }

  private async conversationFor(id: string, user: any) {
    const conversation = await this.prisma.conversation.findUnique({ where: { id } });
    if (!conversation) throw new NotFoundException('Conversation not found');
    if (!this.isStaff(user) && !conversation.participantIds.includes(user.sub)) {
      throw new ForbiddenException('You are not part of this conversation');
    }
    return conversation;
  }

  @Get('conversations')
  async conversations(@Request() req: any) {
    const me = req.user;
    const conversations = await this.prisma.conversation.findMany({
      where: this.isStaff(me) ? {} : { participantIds: { has: me.sub } },
      orderBy: { updatedAt: 'desc' },
      include: { messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });

    const ids = [...new Set(conversations.flatMap((c) => c.participantIds))];
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, email: true, role: true },
    });
    const byId = new Map(users.map((u) => [u.id, u]));

    return Promise.all(
      conversations.map(async (c) => ({
        id: c.id,
        participants: c.participantIds
          .map((id) => byId.get(id))
          .filter(Boolean)
          .map((u) => ({ id: u!.id, name: u!.name || u!.email, role: u!.role })),
        lastMessage: c.messages[0]
          ? { content: c.messages[0].content, createdAt: c.messages[0].createdAt, senderId: c.messages[0].senderId }
          : null,
        unread: await this.prisma.message.count({
          where: { conversationId: c.id, read: false, senderId: { not: me.sub } },
        }),
      })),
    );
  }

  /** A learner's conversation with their programme team, created on first use. */
  @Post('support')
  async support(@Request() req: any) {
    const me = req.user;
    const existing = await this.prisma.conversation.findFirst({
      where: { participantIds: { has: me.sub } },
      orderBy: { createdAt: 'asc' },
    });
    if (existing) return { id: existing.id };

    // the cohort manager if there is one, otherwise the first admin
    const enrolment = await this.prisma.enrolment.findFirst({
      where: { userId: me.sub },
      include: { batch: true },
    });
    const coachId =
      enrolment?.batch?.managerId ??
      (
        await this.prisma.user.findFirst({
          where: { role: { in: [Role.SUPER_ADMIN, Role.ADMIN] } },
          orderBy: { createdAt: 'asc' },
        })
      )?.id;
    if (!coachId) throw new NotFoundException('No programme team member is available yet');

    const created = await this.prisma.conversation.create({
      data: { participantIds: [me.sub, coachId] },
    });
    return { id: created.id };
  }

  @Get('conversations/:id')
  async messages(@Param('id') id: string, @Request() req: any) {
    const me = req.user;
    await this.conversationFor(id, me);

    // opening a conversation marks the other side's messages as read
    await this.prisma.message.updateMany({
      where: { conversationId: id, read: false, senderId: { not: me.sub } },
      data: { read: true },
    });

    const messages = await this.prisma.message.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: 'asc' },
      include: { sender: { select: { name: true, email: true } } },
    });
    return messages.map((m) => ({
      id: m.id,
      senderId: m.senderId,
      senderName: m.sender.name || m.sender.email,
      content: m.content,
      createdAt: m.createdAt,
    }));
  }

  @Post('conversations/:id')
  async send(@Param('id') id: string, @Body() body: SendMessageDto, @Request() req: any) {
    const me = req.user;
    await this.conversationFor(id, me);

    const message = await this.prisma.message.create({
      data: { conversationId: id, senderId: me.sub, content: body.content.trim() },
    });
    // keeps the conversation at the top of the inbox
    await this.prisma.conversation.update({ where: { id }, data: { updatedAt: new Date() } });
    return { id: message.id, senderId: message.senderId, content: message.content, createdAt: message.createdAt };
  }
}

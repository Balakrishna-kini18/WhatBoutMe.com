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
import { Role, NotificationChannel } from '@prisma/client';
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

  private isAdmin(user: any) {
    return user.role === Role.SUPER_ADMIN || user.role === Role.ADMIN || user.role === 'SUPER_ADMIN' || user.role === 'ADMIN';
  }

  private isManager(user: any) {
    return user.role === Role.MANAGER || user.role === 'MANAGER' || user.role === 'TEACHER';
  }

  private async conversationFor(id: string, user: any) {
    const conversation = await this.prisma.conversation.findUnique({ where: { id } });
    if (!conversation) throw new NotFoundException('Conversation not found');

    if (this.isAdmin(user)) {
      return conversation;
    }

    const myId = user.sub || user.id;
    if (conversation.participantIds.includes(myId)) {
      return conversation;
    }

    if (this.isManager(user)) {
      const isCohortLearner = await this.prisma.enrolment.findFirst({
        where: {
          userId: { in: conversation.participantIds },
          batch: {
            OR: [
              { managerId: myId },
              { trainers: { some: { trainerId: myId } } },
            ],
          },
        },
      });
      if (isCohortLearner) {
        return conversation;
      }
    }

    throw new ForbiddenException('You are not part of this conversation');
  }

  @Get('conversations')
  async conversations(@Request() req: any) {
    const me = req.user;
    let where: any;

    if (this.isAdmin(me)) {
      where = {};
    } else if (this.isManager(me)) {
      const myId = me.sub || me.id;
      const enrolments = await this.prisma.enrolment.findMany({
        where: {
          batch: {
            OR: [
              { managerId: myId },
              { trainers: { some: { trainerId: myId } } },
            ],
          },
        },
        select: { userId: true },
      });
      const cohortLearnerIds = enrolments.map((e) => e.userId);
      where = {
        OR: [
          { participantIds: { has: myId } },
          ...(cohortLearnerIds.length > 0 ? [{ participantIds: { hasSome: cohortLearnerIds } }] : []),
        ],
      };
    } else {
      where = { participantIds: { has: me.sub || me.id } };
    }

    const conversations = await this.prisma.conversation.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: { messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });

    // Deduplicate conversations having identical participants:
    // keep the one with the latest messages or most recent update
    const seen = new Set<string>();
    const uniqueConversations = conversations.filter((c) => {
      const key = [...c.participantIds].sort().join(':');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const ids = [...new Set(uniqueConversations.flatMap((c) => c.participantIds))];
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, email: true, role: true },
    });
    const byId = new Map(users.map((u) => [u.id, u]));

    return Promise.all(
      uniqueConversations.map(async (c) => ({
        id: c.id,
        participants: c.participantIds
          .map((id) => byId.get(id))
          .filter(Boolean)
          .map((u) => ({ id: u!.id, name: u!.name || u!.email, role: u!.role })),
        lastMessage: c.messages[0]
          ? { content: c.messages[0].content, createdAt: c.messages[0].createdAt, senderId: c.messages[0].senderId }
          : null,
        unread: await this.prisma.message.count({
          where: { conversationId: c.id, read: false, senderId: { not: me.sub || me.id } },
        }),
      })),
    );
  }

  /** A learner's conversation with their programme team, created on first use. */
  @Post('support')
  async support(@Request() req: any) {
    const me = req.user;
    const myId = me.sub || me.id;

    // Check if an existing conversation with this learner already exists (picking the one with messages first)
    const existing = await this.prisma.conversation.findFirst({
      where: { participantIds: { has: myId } },
      orderBy: [{ updatedAt: 'desc' }],
      include: { _count: { select: { messages: true } } },
    });
    if (existing) return { id: existing.id };

    // the cohort manager if there is one, otherwise the first admin
    const enrolment = await this.prisma.enrolment.findFirst({
      where: { userId: myId },
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

    // Double check before creating to prevent race condition duplicates
    const checkAgain = await this.prisma.conversation.findFirst({
      where: {
        AND: [
          { participantIds: { has: myId } },
          { participantIds: { has: coachId } },
        ],
      },
    });
    if (checkAgain) return { id: checkAgain.id };

    const created = await this.prisma.conversation.create({
      data: { participantIds: [myId, coachId] },
    });
    return { id: created.id };
  }

  @Get('conversations/:id')
  async messages(@Param('id') id: string, @Request() req: any) {
    const me = req.user;
    const myId = me.sub || me.id;
    await this.conversationFor(id, me);

    // opening a conversation marks the other side's messages as read
    await this.prisma.message.updateMany({
      where: { conversationId: id, read: false, senderId: { not: myId } },
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
      senderName: m.sender?.name || m.sender?.email || 'Unknown',
      content: m.content,
      createdAt: m.createdAt,
    }));
  }

  @Post('conversations/:id')
  async send(@Param('id') id: string, @Body() body: SendMessageDto, @Request() req: any) {
    const me = req.user;
    const myId = me.sub || me.id;
    const conversation = await this.conversationFor(id, me);

    const message = await this.prisma.message.create({
      data: { conversationId: id, senderId: myId, content: body.content.trim() },
      include: { sender: { select: { name: true, email: true } } },
    });

    // keeps the conversation at the top of the inbox
    await this.prisma.conversation.update({ where: { id }, data: { updatedAt: new Date() } });

    // Ensure sender is recorded in participantIds
    if (!conversation.participantIds.includes(myId)) {
      await this.prisma.conversation.update({
        where: { id },
        data: { participantIds: { push: myId } },
      });
    }

    // In-app notifications for other participants
    const senderName = message.sender?.name || message.sender?.email || 'Someone';
    const otherParticipantIds = conversation.participantIds.filter((pid: string) => pid !== myId);
    for (const recipientId of otherParticipantIds) {
      await this.prisma.notification.create({
        data: {
          userId: recipientId,
          type: 'CHAT_MESSAGE',
          channel: NotificationChannel.IN_APP,
          template: `New message from ${senderName}: ${body.content.trim().slice(0, 100)}`,
          deliveryStatus: 'DELIVERED',
          sentAt: new Date(),
        },
      }).catch(() => {});
    }

    return {
      id: message.id,
      senderId: message.senderId,
      senderName,
      content: message.content,
      createdAt: message.createdAt,
    };
  }
}

import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ConversationStatus, Role } from '@prisma/client';

@Injectable()
export class ChatService {
  constructor(private prisma: PrismaService) {}

  async startConversation(userId: string, batchId: string, initialMessage: string) {
    // Check if user is enrolled in the batch
    const enrolment = await this.prisma.enrolment.findFirst({
      where: { userId, batchId }
    });

    if (!enrolment) {
      throw new ForbiddenException('You can only start a conversation for a batch you are enrolled in.');
    }

    // Get batch trainers and manager to route the inquiry
    const batch = await this.prisma.batch.findUnique({
      where: { id: batchId },
      include: { trainers: true }
    });

    if (!batch) {
      throw new NotFoundException('Batch not found');
    }

    const participantIds = [userId];
    if (batch.managerId) {
      participantIds.push(batch.managerId);
    }
    batch.trainers.forEach(t => participantIds.push(t.trainerId));

    // Remove duplicates
    const uniqueParticipants = [...new Set(participantIds)];

    return this.prisma.conversation.create({
      data: {
        batchId,
        participantIds: uniqueParticipants,
        status: ConversationStatus.OPEN,
        messages: {
          create: {
            senderId: userId,
            content: initialMessage,
          }
        }
      },
      include: {
        messages: true
      }
    });
  }

  async getConversations(userId: string) {
    return this.prisma.conversation.findMany({
      where: {
        participantIds: {
          has: userId
        }
      },
      orderBy: { updatedAt: 'desc' },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      }
    });
  }

  async sendMessage(conversationId: string, senderId: string, content: string, attachmentUrl?: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId }
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    if (!conversation.participantIds.includes(senderId)) {
      throw new ForbiddenException('You are not a participant in this conversation');
    }

    const message = await this.prisma.message.create({
      data: {
        conversationId,
        senderId,
        content,
        attachmentUrl
      }
    });

    // Update conversation's updatedAt
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() }
    });

    return message;
  }

  async getMessages(conversationId: string, userId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId }
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    if (!conversation.participantIds.includes(userId)) {
      throw new ForbiddenException('You are not a participant in this conversation');
    }

    return this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      include: {
        sender: {
          select: { id: true, name: true, role: true }
        }
      }
    });
  }

  async updateStatus(conversationId: string, userId: string, userRole: Role, status: ConversationStatus) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId }
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    if (!conversation.participantIds.includes(userId)) {
      throw new ForbiddenException('You are not a participant in this conversation');
    }

    if (userRole === Role.USER) {
      throw new ForbiddenException('Only staff can update conversation status');
    }

    return this.prisma.conversation.update({
      where: { id: conversationId },
      data: { status }
    });
  }
}

import { Body, Controller, Delete, Get, Param, Patch, Post, Optional, Query } from '@nestjs/common';
// import { Throttle } from '@nestjs/throttler';
import { ConversationStatus, LeadStatus, Role } from '@prisma/client';
import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { Public } from '../../common/decorators/public.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { EmailService } from '../email/email.service.js';

export class CreateLeadDto {
  @IsString() @IsNotEmpty() @MaxLength(120) name: string;
  @IsEmail() @MaxLength(200) email: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(4000) message?: string;
  @IsOptional() @IsString() inquiryType?: 'GENERAL' | 'COURSE';
  @IsOptional() @IsString() courseId?: string;
  @IsOptional() @IsString() selectedCourseId?: string;
  @IsOptional() @IsString() courseTitle?: string;
  @IsOptional() @IsString() honeypot?: string;
}

export class UpdateLeadDto {
  @IsEnum(LeadStatus) status: LeadStatus;
}

/** Enquiries from the public website, worked through in the admin CRM. */
@Controller('leads')
export class LeadsController {
  constructor(
    private prisma: PrismaService,
    @Optional() private readonly emailService?: EmailService,
  ) {}

  // public form: keep it to a handful of submissions a minute per address
  @Public()
  @Post()
  async create(@Body() body: CreateLeadDto) {
    if (body.honeypot?.trim()) {
      return { success: true, message: 'Your message has been received.' };
    }

    const type = body.inquiryType?.toUpperCase() === 'GENERAL' ? 'GENERAL' : 'COURSE';

    if (type === 'GENERAL') {
      const email = body.email.toLowerCase().trim();
      let user = await this.prisma.user.findUnique({ where: { email } });
      if (!user) {
        user = await this.prisma.user.create({
          data: {
            email,
            name: body.name.trim(),
            phone: body.phone?.trim() || null,
            role: Role.USER,
          },
        });
      }

      const admin = await this.prisma.user.findFirst({
        where: { role: { in: [Role.SUPER_ADMIN, Role.ADMIN] } },
        orderBy: { createdAt: 'asc' },
      });

      const participantIds = admin ? [user.id, admin.id] : [user.id];
      let conversation = await this.prisma.conversation.findFirst({
        where: {
          AND: [
            { participantIds: { has: user.id } },
            admin ? { participantIds: { has: admin.id } } : {},
          ],
        },
      });

      if (!conversation) {
        conversation = await this.prisma.conversation.create({
          data: {
            participantIds,
            status: ConversationStatus.OPEN,
          },
        });
      }

      const formattedContent = [
        body.phone ? `📞 Phone: ${body.phone}` : null,
        body.message ? body.message.trim() : null,
      ]
        .filter(Boolean)
        .join('\n\n');

      await this.prisma.message.create({
        data: {
          conversationId: conversation.id,
          senderId: user.id,
          content: formattedContent,
          read: false,
        },
      });

      await this.prisma.conversation.update({
        where: { id: conversation.id },
        data: { updatedAt: new Date() },
      });

      if (this.emailService) {
        const adminEmail = process.env.SMTP_USER || 'admin@whatboutme.com';
        this.emailService
          .sendTemplateEmail({
            to: adminEmail,
            subject: `New General Inquiry: ${body.name}`,
            template: 'LeadEnquiryNotificationEmail',
            props: {
              name: body.name,
              email: body.email,
              phone: body.phone,
              message: `[General Inquiry]\n\n${body.message || ''}`,
            },
          })
          .catch((e: any) => console.warn('[LeadsController] General inquiry email error:', e?.message));
      }

      return { success: true, inquiryType: 'GENERAL', conversationId: conversation.id };
    }

    // Default COURSE lead creation
    const courseId = body.courseId || body.selectedCourseId;
    let messageText = body.message?.trim() || '';
    if (courseId && !messageText.includes('Course:')) {
      const program = await this.prisma.program.findUnique({
        where: { id: courseId },
        select: { title: true },
      });
      const title = program?.title || body.courseTitle || courseId;
      messageText = [`Course Inquiry: ${title} (ID: ${courseId})`, messageText].filter(Boolean).join('\n\n');
    }

    const lead = await this.prisma.lead.create({
      data: {
        name: body.name.trim(),
        email: body.email.toLowerCase().trim(),
        phone: body.phone?.trim() || null,
        message: messageText || null,
      },
    });

    if (this.emailService) {
      const adminEmail = process.env.SMTP_USER || 'admin@whatboutme.com';
      this.emailService
        .sendTemplateEmail({
          to: adminEmail,
          subject: `New Course Inquiry Lead: ${body.name}`,
          template: 'LeadEnquiryNotificationEmail',
          props: {
            name: body.name,
            email: body.email,
            phone: body.phone,
            message: messageText,
          },
        })
        .catch((e: any) => console.warn('[LeadsController] Lead email notification error:', e?.message));
    }

    return { id: lead.id, status: lead.status, success: true, triggerDiscoveryCall: true, inquiryType: 'COURSE' };
  }

  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER)
  @Get()
  list(@Query('page') page?: string, @Query('limit') limit?: string) {
    const pageNum = Math.max(1, parseInt(page || '1', 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit || '50', 10) || 50));
    const skip = (pageNum - 1) * limitNum;

    return this.prisma.lead.findMany({
      skip,
      take: limitNum,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        message: true,
        status: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER)
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateLeadDto) {
    return this.prisma.lead.update({ where: { id }, data: { status: body.status } });
  }

  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.prisma.lead.delete({ where: { id } });
  }
}

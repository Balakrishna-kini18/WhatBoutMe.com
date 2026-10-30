import {
  BadRequestException,
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Optional,
  Post,
  Req,
} from '@nestjs/common';
import { ConversationStatus, LeadStatus, Role } from '@prisma/client';
import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import type { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { EmailService } from '../email/email.service.js';

export class SubmitContactInquiryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @IsEmail()
  @MaxLength(200)
  email: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  phone: string;

  @IsString()
  @IsNotEmpty()
  inquiryType: 'GENERAL' | 'COURSE';

  @IsOptional()
  @IsString()
  courseId?: string;

  @IsOptional()
  @IsString()
  selectedCourseId?: string;

  @IsOptional()
  @IsString()
  courseTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  message?: string;

  // Honeypot field for bot spam prevention
  @IsOptional()
  @IsString()
  honeypot?: string;

  @IsOptional()
  @IsString()
  botField?: string;
}

/**
 * Sliding-window rate limiter per client IP.
 * Maximum 5 submissions per 60 seconds.
 */
class ContactRateLimiter {
  private requests = new Map<string, number[]>();
  private readonly WINDOW_MS = 60 * 1000;
  private readonly MAX_PER_WINDOW = 5;

  isRateLimited(key: string): boolean {
    const now = Date.now();
    const timestamps = this.requests.get(key) || [];
    const valid = timestamps.filter((t) => now - t < this.WINDOW_MS);

    if (valid.length >= this.MAX_PER_WINDOW) {
      this.requests.set(key, valid);
      return true;
    }

    valid.push(now);
    this.requests.set(key, valid);
    return false;
  }
}

@Controller('contact')
export class ContactController {
  private rateLimiter = new ContactRateLimiter();

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly emailService?: EmailService,
  ) {}

  @Public()
  @Post()
  async submit(@Body() body: SubmitContactInquiryDto, @Req() req: Request) {
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.ip ||
      'unknown';

    // 1. Rate Limiting Check
    if (this.rateLimiter.isRateLimited(ip)) {
      throw new HttpException(
        'Too many messages just now. Please wait a minute and try again.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // 2. Honeypot Spam Bot Trap
    if (body.honeypot?.trim() || body.botField?.trim()) {
      return {
        success: true,
        message: 'Your inquiry has been received.',
      };
    }

    // 3. Validation
    const name = body.name?.trim();
    const email = body.email?.toLowerCase().trim();
    const phone = body.phone?.trim();
    const type = body.inquiryType?.toUpperCase() === 'COURSE' ? 'COURSE' : 'GENERAL';
    const message = body.message?.trim() || '';

    if (!name || !email || !phone) {
      throw new BadRequestException('Full name, email, and phone number are strictly required.');
    }

    const adminEmail = process.env.SMTP_USER || 'admin@whatboutme.com';

    // 4. Intelligent Routing
    if (type === 'COURSE') {
      const courseId = body.courseId || body.selectedCourseId;
      if (!courseId) {
        throw new BadRequestException('A course must be selected for Course Inquiries.');
      }

      // Verify course exists
      const program = await this.prisma.program.findUnique({
        where: { id: courseId },
        select: { id: true, title: true, slug: true },
      });

      const courseTitle = program?.title || body.courseTitle || 'Selected Course';

      // Save as high-intent CRM sales lead
      const lead = await this.prisma.lead.create({
        data: {
          name,
          email,
          phone,
          message: [
            `Course Inquiry: ${courseTitle} (ID: ${courseId})`,
            message ? message : null,
          ]
            .filter(Boolean)
            .join('\n\n'),
          status: LeadStatus.NEW,
        },
      });

      // Email the team
      if (this.emailService) {
        try {
          await this.emailService.sendTemplateEmail({
            to: adminEmail,
            subject: `High-Intent Course Inquiry: ${name} (${courseTitle})`,
            template: 'LeadEnquiryNotificationEmail',
            props: {
              name,
              email,
              phone,
              message: `Course: ${courseTitle} (ID: ${courseId})\n\n${message}`,
            },
          });
        } catch (err: any) {
          console.warn('[ContactController] Course inquiry email error:', err?.message);
        }
      }

      return {
        success: true,
        inquiryType: 'COURSE',
        leadId: lead?.id,
        courseId,
        courseTitle,
        triggerDiscoveryCall: true,
        message:
          'Your course inquiry has been received. Please proceed to book your 15-minute discovery call.',
      };
    }

    // GENERAL INQUIRY ROUTING
    // Find or create User with role: USER so it surfaces cleanly in Admin Support Inbox
    let user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email,
          name,
          phone,
          role: Role.USER,
        },
      });
    } else if (!user.phone && phone) {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { phone },
      });
    }

    // Find primary Admin / Super Admin
    const admin = await this.prisma.user.findFirst({
      where: { role: { in: [Role.SUPER_ADMIN, Role.ADMIN] } },
      orderBy: { createdAt: 'asc' },
    });

    const participantIds = admin ? [user.id, admin.id] : [user.id];

    // Find or create conversation thread
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

    // Append inquiry message
    const formattedContent = [
      `📞 Phone: ${phone}`,
      message ? message : null,
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

    // Touch conversation updatedAt for immediate top ranking in inbox
    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date() },
    });

    // Email team
    if (this.emailService) {
      try {
        await this.emailService.sendTemplateEmail({
          to: adminEmail,
          subject: `New General Inquiry from ${name}`,
          template: 'LeadEnquiryNotificationEmail',
          props: {
            name,
            email,
            phone,
            message: `[General Inquiry]\n\n${message}`,
          },
        });
      } catch (err: any) {
        console.warn('[ContactController] General inquiry email error:', err?.message);
      }
    }

    // Also save as Lead in DB so it surfaces in Admin CRM (apps/admin/app/leads/page.tsx)
    const lead = await this.prisma.lead.create({
      data: {
        name,
        email,
        phone,
        message: [
          `[General Enquiry - WhatsApp]`,
          message ? message : null,
        ]
          .filter(Boolean)
          .join('\n\n'),
        status: LeadStatus.NEW,
      },
    });

    return {
      success: true,
      inquiryType: 'GENERAL',
      leadId: lead?.id,
      conversationId: conversation.id,
      message: 'Your message has been sent to our team. We will respond shortly.',
    };
  }
}

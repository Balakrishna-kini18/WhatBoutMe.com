import { getAppUrls } from '../../common/config/app-urls.js';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  NotFoundException,
  Param,
  Patch,
  Post,
  Optional,
  Query,
  Req,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { BatchStatus, ConversationStatus, EnrolmentStatus, LeadStatus, Role } from '@prisma/client';
import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { Public } from '../../common/decorators/public.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { EmailService } from '../email/email.service.js';
import { AuditLogService } from '../../common/audit/audit-log.service.js';
import { JwtService } from '@nestjs/jwt';
import { Throttle } from '@nestjs/throttler';

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

export class ConvertLeadDto {
  @IsOptional() @IsString() courseId?: string;
  @IsOptional() @IsString() batchId?: string;
  @IsOptional() @IsString() currency?: 'USD' | 'AED' | 'INR';
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

/** Enquiries from the public website, worked through in the admin CRM. */
@Controller(['leads', 'api/leads'])
export class LeadsController {
  private readonly logger = new Logger(LeadsController.name);

  constructor(
    private prisma: PrismaService,
    @Optional() private readonly emailService?: EmailService,
    @Optional() private readonly auditService?: AuditLogService,
    @Optional() private readonly jwtService?: JwtService,
  ) { }

  // Public inquiry form: throttled to 10 submissions per minute per client address to mitigate spam and mailer bombing
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
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
        try {
          await this.emailService.sendTemplateEmail({
            to: adminEmail,
            subject: `New General Inquiry: ${body.name}`,
            template: 'LeadEnquiryNotificationEmail',
            props: {
              name: body.name,
              email: body.email,
              phone: body.phone,
              message: `[General Inquiry]\n\n${body.message || ''}`,
            },
          });
        } catch (e: any) {
          console.warn('[LeadsController] General inquiry email error:', e?.message);
        }
      }

      // Also persist Lead in CRM table so admin sees it in apps/admin/app/leads/page.tsx
      const lead = await this.prisma.lead.create({
        data: {
          name: body.name.trim(),
          email,
          phone: body.phone?.trim() || null,
          message: [
            `[General Enquiry - WhatsApp]`,
            body.message ? body.message.trim() : null,
          ]
            .filter(Boolean)
            .join('\n\n'),
          status: LeadStatus.NEW,
        },
      });

      return {
        id: lead.id,
        leadId: lead.id,
        success: true,
        inquiryType: 'GENERAL',
        conversationId: conversation.id,
      };
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
      try {
        await this.emailService.sendTemplateEmail({
          to: adminEmail,
          subject: `New Course Inquiry Lead: ${body.name}`,
          template: 'LeadEnquiryNotificationEmail',
          props: {
            name: body.name,
            email: body.email,
            phone: body.phone,
            message: messageText,
          },
        });
      } catch (e: any) {
        console.warn('[LeadsController] Lead email notification error:', e?.message);
      }
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

  private maskEmail(email: string): string {
    if (!email || !email.includes('@')) return '***@***.com';
    const [local, domain] = email.split('@');
    if (local.length <= 2) return `${local[0]}***@${domain}`;
    return `${local[0]}***${local[local.length - 1]}@${domain}`;
  }

  /**
   * Public: Decode and validate checkout token (Pay-First Magic Link)
   * Returns sanitized course, batch, pricing, and masked candidate identity.
   * Never mints an unauthenticated session or returns raw access tokens.
   */
  @Public()
  @Get('checkout-token/:token')
  async getCheckoutTokenDetails(@Param('token') token: string) {
    let leadId: string;
    let userId: string;
    let programId: string;
    let batchId: string | null = null;
    let enrolmentId: string;
    let currency: 'USD' | 'AED' | 'INR' = 'USD';
    let amount: number | undefined = undefined;

    // First attempt: resolve via LeadCheckoutLink database record
    const tokenHash = crypto.createHash('sha256').update(token.trim()).digest('hex');
    const link = await this.prisma.leadCheckoutLink.findUnique({
      where: { tokenHash },
    });

    if (link) {
      if (link.revokedAt || link.usedAt) {
        throw new BadRequestException('This checkout link has already been used or expired. Please contact support.');
      }
      if (link.expiresAt < new Date()) {
        throw new BadRequestException('This checkout link has expired (72h limit). Please request a new consultation link.');
      }
      leadId = link.leadId;
      userId = link.userId;
      programId = link.programId;
      batchId = link.batchId;
      enrolmentId = link.enrolmentId;
    } else {
      // Fallback for legacy HMAC tokens
      const payload = this.verifyLeadCheckoutToken(token);
      leadId = payload.leadId;
      userId = payload.userId;
      programId = payload.programId;
      batchId = payload.batchId || null;
      enrolmentId = payload.enrolmentId;
      currency = payload.currency || 'USD';
      amount = payload.amount;
    }

    const [lead, program, batch, enrolment] = await Promise.all([
      this.prisma.lead.findUnique({ where: { id: leadId } }),
      this.prisma.program.findUnique({ where: { id: programId } }),
      batchId ? this.prisma.batch.findUnique({ where: { id: batchId }, select: { id: true, name: true, startDate: true } }) : null,
      this.prisma.enrolment.findUnique({ where: { id: enrolmentId }, select: { id: true, status: true } }),
    ]);

    if (!lead || !program) {
      throw new NotFoundException('Course or registration details for this link could not be found.');
    }

    const resolvedAmount = amount !== undefined ? amount : this.getProgramPrice(program, currency);

    // Pay-First Magic Link: Zero session tokens or raw PII returned before payment
    return {
      valid: true,
      candidateName: lead.name,
      maskedEmail: this.maskEmail(lead.email),
      program: {
        id: program.id,
        title: program.title,
        slug: program.slug,
        description: program.description,
      },
      batch,
      enrolment,
      enrolmentId: enrolment?.id || enrolmentId,
      currency,
      amount: resolvedAmount,
      pricing: {
        amount: resolvedAmount,
        currency,
        formatted: `${currency === 'INR' ? '₹' : currency === 'AED' ? 'AED ' : '$'}${resolvedAmount.toLocaleString()}`,
      },
    };
  }

  /**
   * One-Click Convert Lead & Send Course Payment Link
   * Updates lead to CONVERTED, provisions user & enrolment, logs LEAD_CONVERT audit, and emails the payment link.
   */
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER)
  @Post(':id/convert-and-send-link')
  async convertAndSendLink(
    @Param('id') id: string,
    @Body() body: ConvertLeadDto,
    @Req() req: any,
  ) {
    // 1. Concurrently fetch Lead, specified Program, and specified Batch in ONE round-trip
    const [lead, specifiedProgram, specifiedBatch] = await Promise.all([
      this.prisma.lead.findUnique({ where: { id } }),
      body.courseId ? this.prisma.program.findUnique({ where: { id: body.courseId } }) : null,
      body.batchId ? this.prisma.batch.findUnique({ where: { id: body.batchId } }) : null,
    ]);

    if (!lead) {
      throw new NotFoundException(`Lead '${id}' not found`);
    }

    const email = lead.email.toLowerCase().trim();

    // 2. Concurrently resolve User, Program (fallback if needed), and Batch (fallback if needed)
    let program: any = specifiedProgram;
    if (!program && lead.message) {
      const match = lead.message.match(/ID:\s*([a-zA-Z0-9-]+)/i);
      if (match && match[1]) {
        program = await this.prisma.program.findUnique({ where: { id: match[1] } });
      }
    }

    if (!program) {
      program = await this.prisma.program.findFirst({
        where: { isActive: true },
        orderBy: { createdAt: 'desc' },
      });
    }

    if (!program) {
      throw new BadRequestException('No active course available for converting this lead. Please create or publish a program first.');
    }

    // Parallelize user lookup and batch resolution (if not pre-specified)
    const [existingUser, fallbackBatch] = await Promise.all([
      this.prisma.user.findUnique({ where: { email } }),
      specifiedBatch
        ? null
        : this.prisma.batch.findFirst({
          where: {
            programId: program.id,
            status: { in: [BatchStatus.UPCOMING, BatchStatus.ACTIVE] },
          },
          orderBy: { startDate: 'asc' },
        }),
    ]);

    let user = existingUser;
    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email,
          name: lead.name.trim(),
          phone: lead.phone?.trim() || null,
          role: Role.USER,
        },
      });
    }

    let batch = specifiedBatch || fallbackBatch;
    if (!batch) {
      batch = await this.prisma.batch.create({
        data: {
          programId: program.id,
          name: `${program.title} - Cohort 1`,
          status: BatchStatus.UPCOMING,
          startDate: new Date(Date.now() + 7 * 86400000),
          endDate: new Date(Date.now() + 37 * 86400000),
          capacity: 30,
        },
      });
    }

    // 3. Find or create pending Enrolment (idempotent; resends reuse existing pending enrolment)
    let enrolment = await this.prisma.enrolment.findFirst({
      where: {
        userId: user.id,
        programId: program.id,
      },
    });

    if (!enrolment) {
      enrolment = await this.prisma.enrolment.create({
        data: {
          userId: user.id,
          programId: program.id,
          batchId: batch?.id,
          status: EnrolmentStatus.PENDING_AGREEMENT,
        },
      });
    } else {
      const updated = await this.prisma.enrolment.update({
        where: { id: enrolment.id },
        data: {
          batchId: batch?.id || enrolment.batchId,
          status: enrolment.status === EnrolmentStatus.ACTIVE ? EnrolmentStatus.ACTIVE : EnrolmentStatus.PENDING_AGREEMENT,
        },
      });
      if (updated) {
        enrolment = updated;
      }
    }

    // 4. Calculate Currency & Pricing
    const currency: 'USD' | 'AED' | 'INR' = body.currency || (program.currency as any) || 'USD';
    const amount = this.getProgramPrice(program, currency);

    // 5. Generate secure LeadCheckoutLink record (72-hour TTL per D3)
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
    const actorId = req?.user?.id || req?.user?.sub || 'system';

    await this.prisma.leadCheckoutLink.create({
      data: {
        tokenHash,
        leadId: lead.id,
        userId: user.id,
        enrolmentId: enrolment.id,
        programId: program.id,
        batchId: batch?.id || null,
        expiresAt,
        createdById: actorId !== 'system' ? actorId : null,
      },
    });

    const token = rawToken;

    // 6. Generate Checkout URL
    const { lmsUrl } = getAppUrls();
    const checkoutUrl = `${lmsUrl}/checkout/lead/${token}`;

    // 7. Update Lead status to CONVERTED and log Audit concurrently
    const conversionNotice = `\n[Converted to Enrolment: ${enrolment.id} | Course: ${program.title} | Link: ${checkoutUrl}]`;
    const cleanBaseMessage = (lead.message || '').replace(/\n?\[Converted to Enrolment:[^\]]+\]/gi, '').trim();

    const [updatedLead] = await Promise.all([
      this.prisma.lead.update({
        where: { id: lead.id },
        data: {
          status: LeadStatus.CONVERTED,
          message: cleanBaseMessage ? `${cleanBaseMessage}${conversionNotice}` : conversionNotice.trim(),
        },
      }),
      this.auditService
        ? this.auditService.log(this.prisma, {
          actorId,
          action: 'LEAD_CONVERT',
          entityType: 'Lead',
          entityId: lead.id,
          reason:
            body.note?.trim() ||
            `Converted lead ${lead.name} and dispatched checkout link for ${program.title} (${currency} ${amount})`,
          metadata: {
            leadId: lead.id,
            userId: user.id,
            enrolmentId: enrolment.id,
            programId: program.id,
            batchId: batch?.id,
            currency,
            amount,
            checkoutUrl,
          },
        })
        : Promise.resolve(),
    ]);

    // 10. Email Payment Link to Prospect (Awaited with try/catch to ensure delivery on Vercel Serverless)
    let emailSent = false;
    if (this.emailService) {
      const currencySymbol = currency === 'INR' ? '₹' : currency === 'AED' ? 'AED ' : '$';
      const formattedAmount = `${currencySymbol}${amount.toLocaleString()}`;

      try {
        await this.emailService.sendTemplateEmail({
          to: lead.email,
          subject: `Complete Your Enrolment: ${program.title} — WhatBoutMe`,
          template: 'LeadCheckoutLinkEmail',
          props: {
            learnerName: lead.name,
            courseTitle: program.title,
            programTitle: program.title,
            batchName: batch?.name || 'Upcoming Batch',
            amount,
            currency,
            currencySymbol,
            checkoutUrl,
          },
        });
        emailSent = true;
        this.logger.log(`[convertAndSendLink] Successfully dispatched checkout email to ${lead.email}`);
      } catch (err: any) {
        this.logger.warn(`[convertAndSendLink] Email delivery warning for ${lead.email}: ${err?.message}`);
      }
    }

    return {
      success: true,
      leadId: lead.id,
      leadStatus: updatedLead.status,
      enrolmentId: enrolment.id,
      checkoutUrl,
      token,
      amount,
      currency,
      emailSent,
      message: 'Lead converted successfully. Pre-configured checkout link generated and emailed to prospect.',
    };
  }

  private getCheckoutSecret(): string {
    return process.env.JWT_SECRET || process.env.SESSION_SECRET || 'wbm-lead-checkout-secret-key-32b';
  }

  private generateLeadCheckoutToken(payload: Record<string, any>): string {
    const secret = this.getCheckoutSecret();
    const exp = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days cryptographic expiration
    const fullPayload = { ...payload, exp };
    const payloadStr = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
    const signature = crypto.createHmac('sha256', secret).update(payloadStr).digest('base64url');
    return `${payloadStr}.${signature}`;
  }

  private verifyLeadCheckoutToken(token: string): Record<string, any> {
    const secret = this.getCheckoutSecret();
    const parts = token.split('.');
    if (parts.length !== 2) {
      throw new BadRequestException('Malformed checkout token');
    }
    const [payloadStr, signature] = parts;
    const expectedSig = crypto.createHmac('sha256', secret).update(payloadStr).digest('base64url');

      // Constant-time HMAC comparison to prevent timing attacks
      const sigBuf = Buffer.from(signature);
      const expBuf = Buffer.from(expectedSig);
      if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
        throw new BadRequestException('Invalid or tampered checkout token');
      }
      try {
        const json = Buffer.from(payloadStr, 'base64url').toString('utf8');
        const parsed = JSON.parse(json);
        if (parsed.exp && Date.now() > parsed.exp) {
          throw new BadRequestException('This checkout link has expired. Please request a new consultation link.');
        }
        return parsed;
      } catch (err: any) {
        if (err instanceof BadRequestException) throw err;
        throw new BadRequestException('Could not parse token payload');
      }
    }

  private getProgramPrice(program: any, currency: 'USD' | 'AED' | 'INR'): number {
    if (currency === 'INR' && program.priceINR !== undefined && program.priceINR !== null) {
      return Number(program.priceINR);
    }
    if (currency === 'AED' && program.priceAED !== undefined && program.priceAED !== null) {
      return Number(program.priceAED);
    }
    if (currency === 'USD' && program.priceUSD !== undefined && program.priceUSD !== null) {
      return Number(program.priceUSD);
    }
    return Number(program.price) || 0;
  }
}

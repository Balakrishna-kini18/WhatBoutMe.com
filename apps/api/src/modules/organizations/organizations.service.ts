import { getAppUrls } from '../../common/config/app-urls.js';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  CurrencyCode,
  OrganizationStatus,
  OrganizationType,
  OrgMemberRole,
  Prisma,
  Role,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomBytes, createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service.js';
import { EmailService } from '../email/email.service.js';
import { AddOrgMemberDto, CreateOrganizationDto, UpdateOrganizationDto } from './dto/index.js';

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly emailService?: EmailService,
  ) {}

  /**
   * Generates a unique human-readable Organization Code e.g. "WBM-ORG-0042".
   */
  private async generateOrgCode(): Promise<string> {
    const count = await this.prisma.organization.count();
    const seq = String(count + 1).padStart(4, '0');
    return `WBM-ORG-${seq}`;
  }

  /**
   * Generates a clean URL slug from organization name.
   */
  private generateSlug(name: string): string {
    const baseSlug = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const randSuffix = Math.random().toString(36).substring(2, 6);
    return `${baseSlug}-${randSuffix}`;
  }

  /**
   * Lists organizations with pagination, search, slot utilization, and revenue totals.
   */
  async listOrganizations(query?: {
    search?: string;
    status?: OrganizationStatus;
    page?: number;
    limit?: number;
    orgId?: string;
  }) {
    const page = Math.max(1, Number(query?.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query?.limit) || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.OrganizationWhereInput = {};
    if (query?.orgId) {
      where.id = query.orgId;
    }
    if (query?.status) {
      where.status = query.status;
    }
    if (query?.search) {
      const q = query.search.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { orgCode: { contains: q, mode: 'insensitive' } },
        { contactEmail: { contains: q, mode: 'insensitive' } },
        { billingEmail: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [total, organizations] = await Promise.all([
      this.prisma.organization.count({ where }),
      this.prisma.organization.findMany({
        where,
        skip,
        take: limit,
        include: {
          seatPools: {
            select: {
              totalSeats: true,
              seatsAssigned: true,
              seatsConsumed: true,
              seatsAvailable: true,
              netAmount: true,
              currency: true,
              status: true,
              batchId: true,
              batch: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          _count: {
            select: {
              members: true,
              seats: true,
              sponsoredEnrolments: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    // Aggregate KPIs per organization
    const items = organizations.map((org) => {
      let totalSlots = 0;
      let assignedSlots = 0;
      let consumedSlots = 0;
      let availableSlots = 0;
      let pendingApprovalCount = 0;
      let pendingPaymentCount = 0;
      let pendingSlots = 0;
      const pendingBatchNames: string[] = [];
      const batchIds = new Set<string>();
      const revenueByCurrency: Record<string, number> = { USD: 0, AED: 0, INR: 0 };

      for (const pool of org.seatPools) {
        if (pool.status === 'ACTIVE' || pool.status === 'ACTIVE_UNPAID') {
          totalSlots += pool.totalSeats;
          assignedSlots += pool.seatsAssigned;
          consumedSlots += pool.seatsConsumed;
          availableSlots += pool.seatsAvailable;
          batchIds.add(pool.batchId);
          revenueByCurrency[pool.currency] =
            (revenueByCurrency[pool.currency] || 0) + pool.netAmount;
        } else if (pool.status === 'PENDING_APPROVAL') {
          pendingApprovalCount++;
          pendingSlots += pool.totalSeats;
          if (pool.batch?.name && !pendingBatchNames.includes(pool.batch.name)) {
            pendingBatchNames.push(pool.batch.name);
          }
        } else if (pool.status === 'PENDING_PAYMENT') {
          pendingPaymentCount++;
          pendingSlots += pool.totalSeats;
          if (pool.batch?.name && !pendingBatchNames.includes(pool.batch.name)) {
            pendingBatchNames.push(pool.batch.name);
          }
        }
      }

      return {
        id: org.id,
        orgCode: org.orgCode,
        name: org.name,
        slug: org.slug,
        orgType: org.orgType,
        status: org.status,
        contactPersonName: org.contactPersonName,
        contactEmail: org.contactEmail,
        contactPhone: org.contactPhone,
        billingEmail: org.billingEmail,
        defaultCurrency: org.defaultCurrency,
        isAuthorizedReseller: org.isAuthorizedReseller,
        showSponsorOnCertificate: org.showSponsorOnCertificate,
        sponsorDisplayName: org.sponsorDisplayName,
        allowedEmailDomains: org.allowedEmailDomains,
        totalSlots,
        assignedSlots,
        consumedSlots,
        availableSlots,
        pendingApprovalCount,
        pendingPaymentCount,
        pendingSlots,
        pendingBatchNames,
        activeBatchesCount: batchIds.size,
        revenueByCurrency,
        membersCount: org._count.members,
        createdAt: org.createdAt,
      };
    });

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Retrieves full details of an Organization.
   */
  async getOrganizationById(id: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                role: true,
              },
            },
          },
        },
        seatPools: {
          include: {
            batch: {
              select: {
                id: true,
                name: true,
                startDate: true,
                endDate: true,
                status: true,
              },
            },
            program: {
              select: {
                id: true,
                title: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        invoices: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        accountManager: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!org) {
      throw new NotFoundException(`Organization ${id} not found`);
    }

    return org;
  }

  /**
   * Creates an Organization, provisions the Owner partner user with initial credentials,
   * creates a password reset token, and dispatches a welcome onboarding email.
   */
  async createOrganization(dto: CreateOrganizationDto, actor?: any) {
    const orgCode = await this.generateOrgCode();
    const slug = dto.slug ? dto.slug.toLowerCase().trim() : this.generateSlug(dto.name);

    const targetEmail = (dto.ownerEmail || dto.contactEmail).trim().toLowerCase();
    const targetName = (dto.ownerName || dto.contactPersonName || 'Partner Admin').trim();
    const billingEmail = (dto.billingEmail || dto.contactEmail).trim().toLowerCase();
    const plainPassword = dto.initialPassword?.trim() || 'Partner@2026!';
    const passwordHash = await bcrypt.hash(plainPassword, 10);

    let rawToken: string | null = null;
    let resetUrl: string | null = null;

    const org = await this.prisma.$transaction(
      async (tx) => {
        const createdOrg = await tx.organization.create({
          data: {
            orgCode,
            name: dto.name.trim(),
            slug,
            legalName: dto.legalName,
            orgType: dto.orgType,
            logoUrl: dto.logoUrl,
            website: dto.website,
            country: dto.country,
            timezone: dto.timezone || 'UTC',
            contactPersonName: targetName,
            contactEmail: targetEmail,
            contactPhone: dto.contactPhone,
            billingEmail: billingEmail,
            billingAddress: dto.billingAddress,
            taxId: dto.taxId,
            defaultCurrency: dto.defaultCurrency || CurrencyCode.USD,
            paymentTermsDays: dto.paymentTermsDays ?? 30,
            isAuthorizedReseller:
              dto.isAuthorizedReseller ?? (dto.orgType === OrganizationType.RESELLER_ACADEMY),
            showSponsorOnCertificate: dto.showSponsorOnCertificate ?? true,
            sponsorDisplayName: dto.sponsorDisplayName || `Sponsored by ${dto.name.trim()}`,
            allowedEmailDomains: dto.allowedEmailDomains || [],
            shareExamNumericScores: dto.shareExamNumericScores ?? true,
            internalAdminNotes: dto.internalAdminNotes,
          },
        });

        // Resolve or create initial Owner user
        let ownerUser = await tx.user.findUnique({ where: { email: targetEmail } });
        if (!ownerUser) {
          ownerUser = await tx.user.create({
            data: {
              email: targetEmail,
              name: targetName,
              phone: dto.contactPhone,
              role: Role.USER,
              passwordHash,
            },
          });
        } else {
          // If user exists, update password hash with initial password
          await tx.user.update({
            where: { id: ownerUser.id },
            data: { passwordHash },
          });
        }

        // Link user as Primary Owner in OrganizationMember
        await tx.organizationMember.upsert({
          where: {
            organizationId_userId: {
              organizationId: createdOrg.id,
              userId: ownerUser.id,
            },
          },
          create: {
            organizationId: createdOrg.id,
            userId: ownerUser.id,
            role: OrgMemberRole.OWNER,
            title: 'Organization Owner',
            isPrimary: true,
          },
          update: {
            role: OrgMemberRole.OWNER,
            isPrimary: true,
          },
        });

        // Generate Password Reset Token for 1-click email onboarding
        if (dto.sendInviteEmail !== false) {
          rawToken = randomBytes(32).toString('hex');
          const tokenHash = createHash('sha256').update(rawToken).digest('hex');
          const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours expiry

          await tx.passwordResetToken.create({
            data: {
              userId: ownerUser.id,
              token: tokenHash,
              expiresAt,
            },
          });

          const { adminUrl } = getAppUrls();
          resetUrl = `${adminUrl}/reset-password?token=${rawToken}&email=${encodeURIComponent(targetEmail)}`;
        }

        // Audit Log
        await tx.auditLog.create({
          data: {
            actorId: actor?.id || null,
            action: 'ORGANIZATION_CREATED',
            entity: 'Organization',
            entityId: createdOrg.id,
            meta: {
              orgCode,
              name: createdOrg.name,
              ownerEmail: targetEmail,
              sendInviteEmail: dto.sendInviteEmail !== false,
            },
          },
        });

        return createdOrg;
      },
      {
        maxWait: 15000,
        timeout: 30000,
      },
    );

    // Dispatch welcome email asynchronously if requested
    if (resetUrl && this.emailService) {
      this.emailService
        .sendTemplateEmail({
          to: targetEmail,
          subject: `Welcome to WhatBoutMe Partner Portal — Set Up Your Account (${org.name})`,
          template: 'PasswordResetEmail',
          props: {
            firstName: targetName.split(' ')[0] || targetName,
            resetUrl,
          },
        })
        .catch((err: any) =>
          console.warn('[OrganizationsService] Failed to send partner welcome email:', err?.message),
        );
    }

    return {
      ...org,
      temporaryPassword: plainPassword,
      resetToken: rawToken,
      resetUrl,
      ownerEmail: targetEmail,
    };
  }

  /**
   * Updates an Organization profile.
   */
  async updateOrganization(id: string, dto: UpdateOrganizationDto, actor?: any) {
    const existing = await this.prisma.organization.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Organization ${id} not found`);
    }

    const updated = await this.prisma.organization.update({
      where: { id },
      data: {
        ...(dto.name ? { name: dto.name.trim() } : {}),
        ...(dto.legalName !== undefined ? { legalName: dto.legalName } : {}),
        ...(dto.orgType ? { orgType: dto.orgType } : {}),
        ...(dto.status ? { status: dto.status } : {}),
        ...(dto.logoUrl !== undefined ? { logoUrl: dto.logoUrl } : {}),
        ...(dto.website !== undefined ? { website: dto.website } : {}),
        ...(dto.country !== undefined ? { country: dto.country } : {}),
        ...(dto.timezone !== undefined ? { timezone: dto.timezone } : {}),
        ...(dto.contactPersonName ? { contactPersonName: dto.contactPersonName.trim() } : {}),
        ...(dto.contactEmail ? { contactEmail: dto.contactEmail.trim().toLowerCase() } : {}),
        ...(dto.contactPhone !== undefined ? { contactPhone: dto.contactPhone } : {}),
        ...(dto.billingEmail ? { billingEmail: dto.billingEmail.trim().toLowerCase() } : {}),
        ...(dto.billingAddress !== undefined ? { billingAddress: dto.billingAddress } : {}),
        ...(dto.taxId !== undefined ? { taxId: dto.taxId } : {}),
        ...(dto.defaultCurrency ? { defaultCurrency: dto.defaultCurrency } : {}),
        ...(dto.paymentTermsDays !== undefined ? { paymentTermsDays: dto.paymentTermsDays } : {}),
        ...(dto.isAuthorizedReseller !== undefined ? { isAuthorizedReseller: dto.isAuthorizedReseller } : {}),
        ...(dto.showSponsorOnCertificate !== undefined ? { showSponsorOnCertificate: dto.showSponsorOnCertificate } : {}),
        ...(dto.sponsorDisplayName !== undefined ? { sponsorDisplayName: dto.sponsorDisplayName } : {}),
        ...(dto.allowedEmailDomains !== undefined ? { allowedEmailDomains: dto.allowedEmailDomains } : {}),
        ...(dto.shareExamNumericScores !== undefined ? { shareExamNumericScores: dto.shareExamNumericScores } : {}),
        ...(dto.internalAdminNotes !== undefined ? { internalAdminNotes: dto.internalAdminNotes } : {}),
      },
    });

    // Audit Log
    await this.prisma.auditLog.create({
      data: {
        actorId: actor?.id || null,
        action: 'ORGANIZATION_UPDATED',
        entity: 'Organization',
        entityId: id,
        meta: { changes: dto as any },
      },
    });

    return updated;
  }

  /**
   * Adds a team member to an Organization.
   */
  async addMember(orgId: string, dto: AddOrgMemberDto, actor?: any) {
    const email = dto.email.trim().toLowerCase();
    let user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email,
          role: Role.USER,
        },
      });
    }

    const existingMember = await this.prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: orgId,
          userId: user.id,
        },
      },
    });

    if (existingMember) {
      throw new ConflictException('User is already a member of this organization');
    }

    return this.prisma.organizationMember.create({
      data: {
        organizationId: orgId,
        userId: user.id,
        role: dto.role || OrgMemberRole.VIEWER,
        title: dto.title,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  }

  /**
   * Executive overview for Organization Person Portal (`/org`).
   */
  async getOrganizationOverview(orgId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      include: {
        seatPools: {
          where: { status: { in: ['ACTIVE', 'ACTIVE_UNPAID'] } },
          include: {
            batch: true,
            seats: {
              include: {
                enrolment: {
                  include: {
                    signedAgreement: true,
                    certificate: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!org) throw new NotFoundException('Organization not found');

    let totalSlots = 0;
    let availableSlots = 0;
    let invitedSlots = 0;
    let assignedSlots = 0;
    let consumedSlots = 0;

    let gate1Signed = 0;
    let gate2CurriculumDone = 0;
    let gate3AttendanceDone = 0;
    let gate4OneOnOneDone = 0;
    let gate5ExamDone = 0;
    let gate6CertificatesIssued = 0;

    for (const pool of org.seatPools) {
      totalSlots += pool.totalSeats;
      for (const seat of pool.seats) {
        if (seat.status === 'AVAILABLE') availableSlots++;
        if (seat.status === 'INVITED') invitedSlots++;
        if (seat.status === 'ASSIGNED') assignedSlots++;
        if (seat.status === 'CONSUMED') consumedSlots++;

        const enrolment = seat.enrolment;
        if (enrolment) {
          if (enrolment.signedAgreement?.signedAt) gate1Signed++;
          if (enrolment.curriculumCompletedAt) gate2CurriculumDone++;
          if (enrolment.attendanceSatisfiedAt) gate3AttendanceDone++;
          if (enrolment.oneOnOneStatus === 'COMPLETED') gate4OneOnOneDone++;
          if (enrolment.examPassedAt) gate5ExamDone++;
          if (enrolment.certificate?.certificateCode) gate6CertificatesIssued++;
        }
      }
    }

    const utilizationRate =
      totalSlots > 0 ? Math.round(((totalSlots - availableSlots) / totalSlots) * 100) : 0;

    return {
      organization: {
        id: org.id,
        orgCode: org.orgCode,
        name: org.name,
        slug: org.slug,
        orgType: org.orgType,
        isAuthorizedReseller: org.isAuthorizedReseller,
        defaultCurrency: org.defaultCurrency,
      },
      kpis: {
        totalSlots,
        availableSlots,
        invitedSlots,
        assignedSlots,
        consumedSlots,
        utilizationRate,
        activeBatchesCount: org.seatPools.length,
      },
      funnel: {
        gate1Signed,
        gate2CurriculumDone,
        gate3AttendanceDone,
        gate4OneOnOneDone,
        gate5ExamDone,
        gate6CertificatesIssued,
      },
    };
  }

  /**
   * Deletes an organization permanently after verifying the organization's email.
   * Creates an immutable audit log row per specification.
   */
  async deleteOrganization(id: string, confirmEmail: string | undefined, actor: any) {
    if (!confirmEmail || !confirmEmail.trim()) {
      throw new BadRequestException(
        'Confirmation email is required to delete this organization.',
      );
    }

    const org = await this.prisma.organization.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            members: true,
            seatPools: true,
            seats: true,
          },
        },
      },
    });

    if (!org) {
      throw new NotFoundException(`Organization with ID ${id} not found.`);
    }

    const enteredEmail = confirmEmail.trim().toLowerCase();
    const billingEmail = (org.billingEmail || '').trim().toLowerCase();
    const contactEmail = (org.contactEmail || '').trim().toLowerCase();

    // Verify confirmation email matches either billing email or primary contact email
    const matchesBilling = billingEmail && enteredEmail === billingEmail;
    const matchesContact = contactEmail && enteredEmail === contactEmail;

    if (!matchesBilling && !matchesContact) {
      throw new BadRequestException(
        `Confirmation email does not match organization email. Expected "${org.billingEmail || org.contactEmail}", but received "${confirmEmail}".`,
      );
    }

    // Execute deletion in transaction with generous timeout for remote Neon latency
    await this.prisma.$transaction(
      async (tx) => {
        // 1. Delete associated child records (invites, seats, pools, members)
        await tx.organizationInvite.deleteMany({ where: { organizationId: id } });
        await tx.seat.deleteMany({ where: { organizationId: id } });
        await tx.seatPool.deleteMany({ where: { organizationId: id } });
        await tx.organizationMember.deleteMany({ where: { organizationId: id } });

        // 2. Dissociate batches, enrolments, and invoices (foreign keys with onDelete: SetNull)
        await tx.batch.updateMany({
          where: { sponsorOrganizationId: id },
          data: { sponsorOrganizationId: null, isPrivateOrgBatch: false },
        });
        await tx.enrolment.updateMany({
          where: { organizationId: id },
          data: { organizationId: null },
        });
        await tx.invoice.updateMany({
          where: { organizationId: id },
          data: { organizationId: null },
        });

        // 3. Delete the organization record
        await tx.organization.delete({ where: { id } });

        // 4. Audit Log
        await tx.auditLog.create({
          data: {
            actorId: actor?.id || actor?.sub || null,
            action: 'ORGANIZATION_DELETED',
            entity: 'Organization',
            entityId: id,
            meta: {
              name: org.name,
              orgCode: org.orgCode,
              confirmedEmail: enteredEmail,
              poolsCount: org._count.seatPools,
              seatsCount: org._count.seats,
              membersCount: org._count.members,
            },
          },
        });
      },
      {
        maxWait: 25000,
        timeout: 60000,
      },
    );

    return {
      success: true,
      message: `Organization "${org.name}" (${org.orgCode}) has been permanently deleted.`,
    };
  }
}

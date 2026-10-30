import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role, OrganizationStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service.js';

@Injectable()
export class OrgScopeGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const user = req.user;

    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    // Resolve target organizationId from params (:orgId or :id), query, or headers
    const orgId =
      req.params.orgId ||
      req.params.id ||
      req.query.orgId ||
      req.headers['x-org-id'];

    if (!orgId) {
      throw new ForbiddenException('Organization context (orgId) is required');
    }

    // 1. Global Super Admin & WhatBoutMe Admin bypass
    if (user.role === Role.SUPER_ADMIN || user.role === Role.ADMIN) {
      const org = await this.prisma.organization.findUnique({
        where: { id: orgId },
      });
      if (!org) {
        throw new NotFoundException(`Organization ${orgId} not found`);
      }
      // Attach synthetic owner member for global admins
      req.org = org;
      req.orgMember = {
        organizationId: org.id,
        userId: user.id,
        role: 'OWNER',
        isPrimary: true,
      };
      return true;
    }

    // 2. Organization Member verification
    const member = await this.prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: orgId,
          userId: user.id,
        },
      },
      include: {
        organization: true,
      },
    });

    if (!member) {
      throw new ForbiddenException('You are not a member of this organization');
    }

    if (
      member.organization.status === OrganizationStatus.SUSPENDED ||
      member.organization.status === OrganizationStatus.ARCHIVED
    ) {
      throw new ForbiddenException(
        `Organization is currently ${member.organization.status.toLowerCase()}`,
      );
    }

    req.org = member.organization;
    req.orgMember = member;
    return true;
  }
}


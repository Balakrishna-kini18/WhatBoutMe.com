import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OrgMemberRole, Role } from '@prisma/client';

export const ORG_ROLES_KEY = 'org_roles';
export const RequireOrgRole = (...roles: OrgMemberRole[]) =>
  SetMetadata(ORG_ROLES_KEY, roles);

@Injectable()
export class OrgRoleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<OrgMemberRole[]>(
      ORG_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const req = context.switchToHttp().getRequest();
    const user = req.user;

    // Super Admin & Admin bypass
    if (user?.role === Role.SUPER_ADMIN || user?.role === Role.ADMIN) {
      return true;
    }

    const orgMember = req.orgMember;
    if (!orgMember) {
      throw new ForbiddenException('Organization membership context missing');
    }

    const hasRole = requiredRoles.includes(orgMember.role);
    if (!hasRole) {
      throw new ForbiddenException(
        `Insufficient organization permissions. Required: [${requiredRoles.join(', ')}], Current: ${orgMember.role}`,
      );
    }

    return true;
  }
}


import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() === 'ws') {
      return true;
    }

    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    if (!user) {
      return false;
    }

    // Normalize role string and map legacy TEACHER alias to canonical MANAGER
    const rawRole = user.role;
    const userRole = (rawRole === 'TEACHER' || rawRole === Role.TEACHER)
      ? Role.MANAGER
      : (rawRole as Role);

    // 1. SUPER_ADMIN has full platform-wide authorization across all roles
    if (userRole === Role.SUPER_ADMIN) {
      return true;
    }

    // 2. Direct match with any required role
    if (requiredRoles.includes(userRole)) {
      return true;
    }

    // 3. Role hierarchy: ADMIN satisfies MANAGER requirements
    if (userRole === Role.ADMIN && requiredRoles.includes(Role.MANAGER)) {
      return true;
    }

    // 4. Role hierarchy: Higher roles satisfy USER requirements
    if (requiredRoles.includes(Role.USER)) {
      return true;
    }

    return false;
  }
}

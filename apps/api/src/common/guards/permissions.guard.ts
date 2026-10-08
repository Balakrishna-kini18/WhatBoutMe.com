import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import {
  Permission,
  roleHasPermission,
} from '../../config/permissions.config.js';
import {
  PERMISSIONS_KEY,
  REQUIRE_PERMISSION_KEY,
} from '../decorators/require-permission.decorator.js';

export {
  RequirePermission,
  RequirePermissions,
  PERMISSIONS_KEY,
  REQUIRE_PERMISSION_KEY,
} from '../decorators/require-permission.decorator.js';

/**
 * PermissionsGuard (D1-027)
 *
 * Enforces route-level authorization using granular named permissions:
 * 1. Reads required permissions from route/class metadata.
 * 2. Bypasses checks if no permission metadata is attached.
 * 3. Bypasses checks for WebSocket execution contexts.
 * 4. Universally allows SUPER_ADMIN role (universal super-admin bypass).
 * 5. Rejects unauthenticated requests (throws ForbiddenException).
 * 6. Checks if the authenticated user's role satisfies all required permissions
 *    via the canonical ROLE_PERMISSIONS / roleHasPermission implementation.
 * 7. Throws ForbiddenException if any required permission is not granted to the role.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() === 'ws') {
      return true;
    }

    const requiredPermissions =
      this.reflector.getAllAndOverride<(Permission | string)[]>(
        PERMISSIONS_KEY,
        [context.getHandler(), context.getClass()],
      ) ??
      this.reflector.getAllAndOverride<(Permission | string)[]>(
        REQUIRE_PERMISSION_KEY,
        [context.getHandler(), context.getClass()],
      );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request?.user;

    if (!user) {
      throw new ForbiddenException('Access denied: Authentication required');
    }

    // Universal SUPER_ADMIN bypass
    if (user.role === Role.SUPER_ADMIN || user.role === 'SUPER_ADMIN') {
      return true;
    }

    if (!user.role) {
      throw new ForbiddenException('Access denied: User has no assigned role');
    }

    // Verify all required permissions are possessed by user's role OR custom user permissions array
    const hasAllPermissions = requiredPermissions.every((perm) => {
      const hasRolePerm = roleHasPermission(user.role, perm as Permission);
      if (hasRolePerm) return true;
      // Check dynamic custom permissions
      return user.permissions && Array.isArray(user.permissions) && user.permissions.includes(perm);
    });

    if (!hasAllPermissions) {
      throw new ForbiddenException('Access denied: Insufficient permissions');
    }

    return true;
  }
}

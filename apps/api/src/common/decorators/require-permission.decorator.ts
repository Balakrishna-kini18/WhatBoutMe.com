import { SetMetadata, CustomDecorator } from '@nestjs/common';
import { Permission } from '../../config/permissions.config.js';

export const PERMISSIONS_KEY = 'permissions';
export const REQUIRE_PERMISSION_KEY = 'require_permission';

/**
 * Decorator to specify granular named permissions required to access a controller or route handler.
 * Supports passing single or multiple permissions:
 *
 * @example
 * @RequirePermission(Permission.PROGRAMS_CREATE)
 *
 * @example
 * @RequirePermission(Permission.STEPS_READ, Permission.STEPS_UNLOCK)
 */
export const RequirePermission = (
  ...permissions: (Permission | string)[]
): CustomDecorator<string> => SetMetadata(PERMISSIONS_KEY, permissions);

/**
 * Alias for RequirePermission supporting multiple permissions.
 */
export const RequirePermissions = (
  ...permissions: (Permission | string)[]
): CustomDecorator<string> => SetMetadata(PERMISSIONS_KEY, permissions);

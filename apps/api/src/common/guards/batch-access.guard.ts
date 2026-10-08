import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  BadRequestException,
  NotFoundException,
  SetMetadata,
  CustomDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';

export const BATCH_ACCESS_PARAM_KEY = 'batch_access_param';

/**
 * Decorator to optionally specify which request parameter/field contains the batch ID.
 * Defaults to checking route params ('batchId', 'id'), query params ('batchId', 'id'),
 * and request body ('batchId').
 *
 * @example
 * @Get(':cohortId')
 * @RequireBatchAccess('cohortId')
 * getCohort(@Param('cohortId') id: string) { ... }
 */
export const RequireBatchAccess = (
  paramKey?: string,
): CustomDecorator<string> => SetMetadata(BATCH_ACCESS_PARAM_KEY, paramKey ?? 'batchId');

export const BatchAccess = RequireBatchAccess;

/**
 * Helper utility to verify if a manager/trainer user is explicitly assigned
 * to a batch in Prisma via either:
 * 1. Batch.managerId === userId (direct manager assignment)
 * 2. BatchTrainer record with batchId and trainerId === userId (trainer cohort assignment)
 */
export async function isManagerAssignedToBatch(
  prisma: PrismaService,
  userId: string,
  batchId: string,
): Promise<boolean> {
  if (!userId || !batchId) return false;

  const batch = await prisma.batch.findUnique({
    where: { id: batchId },
    select: {
      id: true,
      managerId: true,
      trainers: {
        where: { trainerId: userId },
        select: { id: true, trainerId: true },
      },
    },
  });

  if (!batch) {
    return false;
  }

  return (
    batch.managerId === userId ||
    (Array.isArray(batch.trainers) &&
      batch.trainers.some((t: any) => (t.trainerId ? t.trainerId === userId : true)))
  );
}

/**
 * BatchAccessGuard (D1-028)
 *
 * Enforces server-side batch isolation and scoping:
 * - SUPER_ADMIN and ADMIN: Unrestricted access across all batches.
 * - MANAGER: Strictly restricted to batches explicitly assigned to them in
 *   Batch.managerId or BatchTrainer.
 * - USER / others: Denied batch management access.
 * - Unauthenticated requests, missing batch IDs, and unassigned access fail closed.
 * - Authenticated user identity is always derived from server-side JWT context (req.user),
 *   ignoring any client-provided body or query managerId.
 */
@Injectable()
export class BatchAccessGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() === 'ws') {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request?.user;

    if (!user) {
      throw new ForbiddenException('Access denied: Authentication required');
    }

    // SUPER_ADMIN and ADMIN have platform-wide access
    if (
      user.role === Role.SUPER_ADMIN ||
      user.role === 'SUPER_ADMIN' ||
      user.role === Role.ADMIN ||
      user.role === 'ADMIN'
    ) {
      return true;
    }

    // Only MANAGER and TEACHER are subject to batch scoping. Other roles have no batch management access.
    if (user.role !== Role.MANAGER && user.role !== 'MANAGER' && user.role !== 'TEACHER') {
      throw new ForbiddenException('Access denied: Role does not have batch management access');
    }

    const userId = user.sub ?? user.userId ?? user.id;
    if (!userId || typeof userId !== 'string') {
      throw new ForbiddenException('Access denied: Authenticated user identifier missing');
    }

    // Resolve batch ID from metadata or standard request locations
    const customParamKey = this.reflector.getAllAndOverride<string | undefined>(
      BATCH_ACCESS_PARAM_KEY,
      [context.getHandler(), context.getClass()],
    );

    const batchId = this.extractBatchId(request, customParamKey);

    if (!batchId) {
      throw new BadRequestException('Batch ID is required for batch scoping verification');
    }

    const batch = await this.prisma.batch.findUnique({
      where: { id: batchId },
      select: {
        id: true,
        managerId: true,
        trainers: {
          where: { trainerId: userId },
          select: { id: true, trainerId: true },
        },
      },
    });

    if (!batch) {
      throw new NotFoundException('Batch not found');
    }

    const isAssigned =
      batch.managerId === userId ||
      (Array.isArray(batch.trainers) &&
        batch.trainers.some((t: any) => (t.trainerId ? t.trainerId === userId : true)));

    if (!isAssigned) {
      throw new ForbiddenException('Access denied: You are not assigned to this batch');
    }

    return true;
  }

  private extractBatchId(request: any, customParamKey?: string): string | null {
    if (customParamKey) {
      const fromParam = request.params?.[customParamKey];
      if (typeof fromParam === 'string' && fromParam.trim()) {
        return fromParam.trim();
      }
      const fromQuery = request.query?.[customParamKey];
      if (typeof fromQuery === 'string' && fromQuery.trim()) {
        return fromQuery.trim();
      }
      const fromBody = request.body?.[customParamKey];
      if (typeof fromBody === 'string' && fromBody.trim()) {
        return fromBody.trim();
      }
    }

    // Default resolution fallback order: params.batchId -> params.id -> query.batchId -> query.id -> body.batchId -> body.id
    const candidates = [
      request.params?.batchId,
      request.params?.id,
      request.query?.batchId,
      request.query?.id,
      request.body?.batchId,
      request.body?.id,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate.trim();
      }
    }

    return null;
  }
}

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

export const BATCH_SCOPE_PARAM_KEY = 'batch_scope_param';

/**
 * Decorator to explicitly specify the request parameter/field name containing the batch ID.
 * Defaults to automatically inspecting params.batchId, params.id, query.batchId, body.batchId,
 * or resolving via params.sessionId.
 */
export const RequireBatchScope = (paramKey?: string): CustomDecorator<string> =>
  SetMetadata(BATCH_SCOPE_PARAM_KEY, paramKey ?? 'batchId');

export const BatchScope = RequireBatchScope;

/**
 * BatchScopeGuard
 *
 * Enforces strict server-side batch isolation and scoping for Managers:
 * - SUPER_ADMIN and ADMIN: Unrestricted access across all batches.
 * - MANAGER: Strictly restricted to batches where batch.managerId === currentUser.id
 *   (or explicitly assigned as a trainer in BatchTrainer).
 * - Rejects unauthorized cross-batch access with 403 Forbidden.
 * - Resolves batch ID from route params, query, body, or by inspecting sessionId.
 */
@Injectable()
export class BatchScopeGuard implements CanActivate {
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

    // SUPER_ADMIN and ADMIN have unrestricted platform access
    if (
      user.role === Role.SUPER_ADMIN ||
      user.role === 'SUPER_ADMIN' ||
      user.role === Role.ADMIN ||
      user.role === 'ADMIN'
    ) {
      return true;
    }

    // Only MANAGER and TEACHER have batch-scoped management access
    if (user.role !== Role.MANAGER && user.role !== 'MANAGER' && user.role !== 'TEACHER') {
      throw new ForbiddenException('Access denied: Role does not have batch management access');
    }

    const userId = user.sub ?? user.userId ?? user.id;
    if (!userId || typeof userId !== 'string') {
      throw new ForbiddenException('Access denied: Authenticated user identifier missing');
    }

    const customParamKey = this.reflector.getAllAndOverride<string | undefined>(
      BATCH_SCOPE_PARAM_KEY,
      [context.getHandler(), context.getClass()],
    );

    let batchId = this.extractBatchId(request, customParamKey);

    // If batchId is not provided directly, check if sessionId is present in params/body
    if (!batchId) {
      const sessionId = request.params?.sessionId ?? request.body?.sessionId ?? request.query?.sessionId;
      if (sessionId && typeof sessionId === 'string') {
        const session = await this.prisma.session.findUnique({
          where: { id: sessionId },
          select: { batchId: true },
        });
        if (session?.batchId) {
          batchId = session.batchId;
        }
      }
    }

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
      throw new ForbiddenException('Access denied: You are not assigned to manage this batch');
    }

    // Attach verified batch to request for downstream controller convenience
    request.scopedBatch = batch;
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

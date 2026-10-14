import {
  Controller,
  Post,
  Param,
  Body,
  Request,
  UseGuards,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AttendanceService } from './attendance.service.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { RequirePermission } from '../../common/decorators/require-permission.decorator.js';
import { Permission } from '../../config/permissions.config.js';
import { CheckInDto } from './dto/link-unmatched.dto.js';
import crypto from 'crypto';
import { Role } from '@prisma/client';

@Controller('sessions/:sessionId/check-in')
@UseGuards(PermissionsGuard)
export class SessionCheckinController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly attendanceService: AttendanceService,
  ) {}

  /**
   * Phase 5 Endpoint 5a:
   * POST /api/sessions/:sessionId/check-in/token
   * Generates or retrieves a secure check-in secret token and URL/QR for an in-person session.
   * Roles: SUPER_ADMIN, ADMIN, MANAGER.
   */
  @RequirePermission(Permission.ATTENDANCE_MARK)
  @Post('token')
  async generateCheckInToken(@Param('sessionId') sessionId: string, @Request() req: any) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        batch: {
          include: { trainers: true },
        },
      },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    // Manager batch scoping check
    if (
      (req.user.role === Role.MANAGER || req.user.role === 'MANAGER' || req.user.role === 'TEACHER') &&
      session.batch
    ) {
      const isAssigned =
        session.batch.managerId === req.user.sub ||
        session.batch.trainers.some((t: any) => t.trainerId === req.user.sub);
      if (!isAssigned) {
        throw new ForbiddenException('You are not assigned to manage this batch');
      }
    }

    let token = session.checkinTokenSecret;
    if (!token) {
      token = crypto.randomBytes(16).toString('hex');
      await this.prisma.session.update({
        where: { id: sessionId },
        data: { checkinTokenSecret: token },
      });
    }

    const checkInUrl = `/check-in/${sessionId}?token=${token}`;

    return {
      sessionId,
      token,
      checkInUrl,
      expiresAtUtc: session.endTime.toISOString(),
    };
  }

  /**
   * Phase 5 Endpoint 5b:
   * POST /api/sessions/:sessionId/check-in
   * When an authenticated learner scans QR code or submits check-in token on their phone.
   * Roles: USER (Learner).
   */
  @RequirePermission(Permission.ATTENDANCE_READ)
  @Post()
  async checkInLearner(
    @Param('sessionId') sessionId: string,
    @Body() body: CheckInDto,
    @Request() req: any,
  ) {
    const userId = req.user.sub ?? req.user.userId ?? req.user.id;
    if (!userId) {
      throw new ForbiddenException('User authentication required');
    }

    if (!body.token) {
      throw new BadRequestException('Check-in token is required');
    }

    const result = await this.attendanceService.checkInWithToken(sessionId, userId, body.token);
    return {
      message: 'Check-in confirmed successfully',
      attendance: result,
    };
  }
}

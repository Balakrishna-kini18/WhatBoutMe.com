import { Controller, Post, Body, Request, BadRequestException } from '@nestjs/common';
import { EnrollmentsService } from './enrollments.service.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Role } from '@prisma/client';
import { IsString, IsNotEmpty } from 'class-validator';

export class CreateMockCheckoutDto {
  @IsString() @IsNotEmpty() programId: string;
}

export class ManualEnrollmentDto {
  @IsString() @IsNotEmpty() userId: string;
  @IsString() @IsNotEmpty() programId: string;
}

@Controller('checkout')
export class EnrollmentsController {
  constructor(private readonly enrollmentsService: EnrollmentsService) {}

  @Post('mock')
  async mockCheckout(@Body() body: CreateMockCheckoutDto, @Request() req: any) {
    if (process.env.PAYMENT_MODE !== 'mock') {
      throw new BadRequestException('Mock payment is disabled');
    }
    return this.enrollmentsService.mockCheckout(req.user.sub, body.programId);
  }
}

@Controller('admin/enrollments')
@Roles(Role.SUPER_ADMIN, Role.ADMIN)
export class AdminEnrollmentsController {
  constructor(private readonly enrollmentsService: EnrollmentsService) {}

  @Post()
  async manualEnrollment(@Body() body: ManualEnrollmentDto) {
    return this.enrollmentsService.mockCheckout(body.userId, body.programId);
  }
}

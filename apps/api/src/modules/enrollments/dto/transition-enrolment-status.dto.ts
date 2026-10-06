import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { EnrolmentStatus } from '@prisma/client';

export class TransitionEnrolmentStatusDto {
  @IsEnum(EnrolmentStatus)
  @IsNotEmpty()
  targetStatus: EnrolmentStatus;

  @IsString()
  @IsOptional()
  reason?: string;
}

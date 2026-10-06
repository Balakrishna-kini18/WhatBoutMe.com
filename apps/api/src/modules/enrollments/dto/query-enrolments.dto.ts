import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { EnrolmentStatus } from '@prisma/client';

export class QueryEnrolmentsDto {
  @IsUUID()
  @IsOptional()
  programId?: string;

  @IsUUID()
  @IsOptional()
  batchId?: string;

  @IsUUID()
  @IsOptional()
  userId?: string;

  @IsEnum(EnrolmentStatus)
  @IsOptional()
  status?: EnrolmentStatus;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  @IsOptional()
  page?: number = 1;

  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  @IsOptional()
  limit?: number = 50;
}

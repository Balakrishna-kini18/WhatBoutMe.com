import { IsOptional, IsString, IsEnum, IsDateString } from 'class-validator';
import { SessionType, SessionStatus } from '@prisma/client';

export class QuerySessionsDto {
  @IsOptional()
  @IsString()
  batchId?: string;

  @IsOptional()
  @IsEnum(SessionType)
  sessionType?: SessionType;

  @IsOptional()
  @IsString()
  trainerId?: string;

  @IsOptional()
  @IsEnum(SessionStatus)
  status?: SessionStatus;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

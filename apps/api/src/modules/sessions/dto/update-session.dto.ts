import {
  IsString,
  IsDateString,
  IsOptional,
  IsEnum,
  IsInt,
  Min,
  Max,
  IsUUID,
} from 'class-validator';
import { SessionStatus } from '@prisma/client';

export class UpdateSessionDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDateString()
  startTime?: string;

  @IsOptional()
  @IsDateString()
  endTime?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  capacity?: number;

  @IsOptional()
  @IsUUID()
  hostTrainerId?: string;

  @IsOptional()
  @IsUUID()
  learnerId?: string;

  @IsOptional()
  @IsEnum(SessionStatus)
  status?: SessionStatus;

  @IsOptional()
  @IsString()
  joinUrl?: string;

  @IsOptional()
  @IsString()
  recordingUrl?: string;

  @IsOptional()
  @IsString()
  agenda?: string;

  @IsOptional()
  @IsString()
  quizId?: string;

  @IsOptional()
  @IsString()
  cancelReason?: string;
}

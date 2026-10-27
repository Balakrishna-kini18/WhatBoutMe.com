import {
  IsString,
  IsNotEmpty,
  IsDateString,
  IsOptional,
  IsEnum,
  IsInt,
  Min,
  Max,
  IsUUID,
} from 'class-validator';
import { SessionType, MeetingProvider } from '@prisma/client';

export class CreateSessionDto {
  @IsString()
  @IsNotEmpty()
  batchId: string;

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsDateString()
  startTime: string;

  @IsDateString()
  endTime: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsEnum(SessionType)
  sessionType?: SessionType;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  capacity?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  minAttendanceMinutes?: number;

  @IsOptional()
  @IsUUID()
  hostTrainerId?: string;

  @IsOptional()
  @IsUUID()
  learnerId?: string;

  @IsOptional()
  @IsEnum(MeetingProvider)
  meetingProvider?: MeetingProvider;

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
}

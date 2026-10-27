import { IsISO8601, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateOneOnOneRequestDto {
  @IsUUID()
  @IsNotEmpty()
  enrolmentId!: string;

  @IsISO8601()
  @IsNotEmpty()
  requestedStart!: string;

  @IsISO8601()
  @IsOptional()
  requestedEnd?: string;

  @IsString()
  @IsOptional()
  learnerTimezone?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class ApproveOneOnOneRequestDto {
  @IsUUID()
  @IsOptional()
  hostTrainerId?: string;

  @IsISO8601()
  @IsOptional()
  startTime?: string;

  @IsISO8601()
  @IsOptional()
  endTime?: string;

  @IsString()
  @IsOptional()
  meetingLink?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class RejectOneOnOneRequestDto {
  @IsString()
  @IsNotEmpty()
  reason!: string;
}

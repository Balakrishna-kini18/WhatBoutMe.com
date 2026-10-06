import { IsDateString, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateOralAssessmentDto {
  @IsUUID('4', { message: 'enrolmentId must be a valid UUID' })
  @IsNotEmpty({ message: 'enrolmentId is required' })
  enrolmentId: string;

  @IsUUID('4', { message: 'programId must be a valid UUID' })
  @IsNotEmpty({ message: 'programId is required' })
  programId: string;

  @IsOptional()
  @IsDateString({}, { message: 'scheduledDate must be a valid ISO date string' })
  scheduledDate?: string;

  @IsOptional()
  @IsString({ message: 'sessionId must be a string' })
  sessionId?: string;
}

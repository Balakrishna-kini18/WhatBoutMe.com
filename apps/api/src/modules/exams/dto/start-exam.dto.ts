import { IsOptional, IsUUID } from 'class-validator';

export class StartExamDto {
  @IsOptional()
  @IsUUID('4', { message: 'enrolmentId must be a valid UUID' })
  enrolmentId?: string;
}

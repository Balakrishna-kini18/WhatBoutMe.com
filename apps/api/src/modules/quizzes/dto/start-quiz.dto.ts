import { IsOptional, IsUUID } from 'class-validator';

export class StartQuizDto {
  @IsOptional()
  @IsUUID('4', { message: 'enrolmentId must be a valid UUID' })
  enrolmentId?: string;
}

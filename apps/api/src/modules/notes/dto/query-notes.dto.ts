import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';

export class QueryNotesDto {
  @IsOptional()
  @IsUUID('4', { message: 'programId must be a valid UUID' })
  programId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'stepId must be a valid UUID' })
  stepId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'lessonId must be a valid UUID' })
  lessonId?: string;

  @IsOptional()
  @IsString({ message: 'search must be a string' })
  search?: string;

  @IsOptional()
  @IsIn(['asc', 'desc'], { message: 'sort must be asc or desc' })
  sort?: 'asc' | 'desc';
}

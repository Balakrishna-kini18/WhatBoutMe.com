import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateNoteDto {
  @IsOptional()
  @IsUUID('4', { message: 'programId must be a valid UUID' })
  programId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'stepId must be a valid UUID' })
  stepId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'lessonId must be a valid UUID' })
  lessonId?: string;

  @IsString({ message: 'noteText must be a string' })
  @IsNotEmpty({ message: 'noteText cannot be empty' })
  @MinLength(1, { message: 'noteText must contain at least 1 character' })
  @MaxLength(5000, { message: 'noteText cannot exceed 5000 characters' })
  noteText: string;

  @IsOptional()
  @IsString({ message: 'highlightSnippet must be a string' })
  @MaxLength(2000, { message: 'highlightSnippet cannot exceed 2000 characters' })
  highlightSnippet?: string;

  @IsOptional()
  @IsInt({ message: 'videoTimestampSeconds must be an integer' })
  @Min(0, { message: 'videoTimestampSeconds cannot be negative' })
  videoTimestampSeconds?: number;
}

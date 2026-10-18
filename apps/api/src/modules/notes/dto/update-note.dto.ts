import {
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class UpdateNoteDto {
  @IsOptional()
  @IsString({ message: 'noteText must be a string' })
  @MinLength(1, { message: 'noteText must contain at least 1 character' })
  @MaxLength(5000, { message: 'noteText cannot exceed 5000 characters' })
  noteText?: string;

  @IsOptional()
  @IsString({ message: 'highlightSnippet must be a string' })
  @MaxLength(2000, { message: 'highlightSnippet cannot exceed 2000 characters' })
  highlightSnippet?: string;

  @IsOptional()
  @IsInt({ message: 'videoTimestampSeconds must be an integer' })
  @Min(0, { message: 'videoTimestampSeconds cannot be negative' })
  videoTimestampSeconds?: number;
}

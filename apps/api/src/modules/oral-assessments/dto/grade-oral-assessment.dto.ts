import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class RubricScoreItemDto {
  @IsString({ message: 'rubricCategory must be a string' })
  @IsNotEmpty({ message: 'rubricCategory is required' })
  rubricCategory: string;

  @IsInt({ message: 'score must be an integer' })
  @Min(0, { message: 'score cannot be negative' })
  score: number;

  @IsOptional()
  @IsInt({ message: 'maxScore must be an integer' })
  @Min(1, { message: 'maxScore must be at least 1' })
  maxScore?: number;

  @IsOptional()
  @IsString({ message: 'feedback must be a string' })
  feedback?: string;
}

export class GradeOralAssessmentDto {
  @IsArray({ message: 'scores must be an array' })
  @ArrayMinSize(1, { message: 'At least one rubric score is required' })
  @ValidateNested({ each: true })
  @Type(() => RubricScoreItemDto)
  scores: RubricScoreItemDto[];

  @IsBoolean({ message: 'passed must be a boolean' })
  passed: boolean;

  @IsString({ message: 'trainerNotes must be a string' })
  @IsNotEmpty({ message: 'trainerNotes is required as qualitative feedback' })
  trainerNotes: string;

  @IsOptional()
  @IsString({ message: 'retryGuidance must be a string' })
  retryGuidance?: string;
}

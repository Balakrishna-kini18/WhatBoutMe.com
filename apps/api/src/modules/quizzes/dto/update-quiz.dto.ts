import { IsInt, IsOptional, IsString, Max, Min, IsObject, IsEnum } from 'class-validator';
import { QuizPlacement } from '@prisma/client';

export class UpdateQuizDto {
  @IsOptional()
  @IsString()
  stepId?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsEnum(QuizPlacement)
  quizPlacement?: QuizPlacement;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  passMark?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxAttempts?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  cooldownHours?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  questionCount?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  timeLimitMin?: number;

  @IsOptional()
  @IsString()
  retryGuidance?: string;

  @IsOptional()
  @IsObject()
  questions?: any;
}

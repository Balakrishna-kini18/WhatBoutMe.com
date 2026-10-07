import { IsInt, IsNotEmpty, IsOptional, IsString, Max, Min, IsObject } from 'class-validator';

export class CreateQuizDto {
  @IsString()
  @IsNotEmpty()
  stepId: string;

  @IsOptional()
  @IsString()
  title?: string;

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

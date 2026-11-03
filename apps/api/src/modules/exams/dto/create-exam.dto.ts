import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class CreateExamDto {
  @IsUUID('4')
  programId: string;

  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  questionCount?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  passMark?: number;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(300)
  timeLimitMin?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxAttempts?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(168)
  cooldownHours?: number;

  @IsOptional()
  @IsBoolean()
  shuffleQuestions?: boolean;

  @IsOptional()
  @IsString()
  retryGuidance?: string;
}

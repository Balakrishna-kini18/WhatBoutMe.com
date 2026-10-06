import { IsString, IsNotEmpty, IsOptional, IsInt, IsEnum, Min, IsArray, ArrayNotEmpty, ArrayUnique } from 'class-validator';
import { ContentStatus, ReleaseSchedule } from '@prisma/client';

export class CreateStepDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  sequence?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  stepNumber?: number; // Alias for sequence per D1-030 spec

  @IsOptional()
  @IsEnum(ContentStatus)
  status?: ContentStatus;

  @IsOptional()
  @IsEnum(ReleaseSchedule)
  releaseSchedule?: ReleaseSchedule;

  @IsOptional()
  @IsInt()
  @Min(0)
  unlockDelayDays?: number;
}

export class UpdateStepDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  sequence?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  stepNumber?: number;

  @IsOptional()
  @IsEnum(ReleaseSchedule)
  releaseSchedule?: ReleaseSchedule;

  @IsOptional()
  @IsInt()
  @Min(0)
  unlockDelayDays?: number;
}

export class ReorderStepsDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  stepIds: string[];
}

export class PublishStepDto {
  @IsEnum(ContentStatus)
  status: ContentStatus;
}

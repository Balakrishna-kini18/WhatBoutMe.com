import { IsString, IsNotEmpty, IsOptional, IsInt, IsEnum, Min, IsArray, ArrayNotEmpty, ArrayUnique } from 'class-validator';
import { ContentType, ContentStatus } from '@prisma/client';

export class CreateLessonDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsEnum(ContentType)
  type: ContentType;

  @IsString()
  @IsNotEmpty()
  mediaUrl: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  durationSec?: number;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  order?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  lessonOrder?: number; // Alias for order per D1-030 spec

  @IsOptional()
  @IsEnum(ContentStatus)
  status?: ContentStatus;
}

export class UpdateLessonDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  title?: string;

  @IsOptional()
  @IsEnum(ContentType)
  type?: ContentType;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  mediaUrl?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  durationSec?: number;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  order?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  lessonOrder?: number;
}

export class ReorderLessonsDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  lessonIds: string[];
}

export class PublishLessonDto {
  @IsEnum(ContentStatus)
  status: ContentStatus;
}

import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { QuestionType } from '@prisma/client';
import { CreateOptionDto } from './create-question.dto.js';

export class UpdateQuestionDto {
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'Question text must not be empty' })
  text?: string;

  @IsOptional()
  @IsEnum(QuestionType, { message: 'Type must be a valid QuestionType' })
  type?: QuestionType;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsString()
  gradingMode?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  minCharacters?: number;

  @IsOptional()
  @IsString()
  explanation?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  points?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOptionDto)
  options?: CreateOptionDto[];
}

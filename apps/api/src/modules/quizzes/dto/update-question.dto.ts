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
  @MinLength(5, { message: 'Question text must be at least 5 characters long' })
  text?: string;

  @IsOptional()
  @IsEnum(QuestionType, { message: 'Type must be a valid QuestionType' })
  type?: QuestionType;

  @IsOptional()
  @IsString()
  explanation?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  points?: number;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(2, { message: 'A question must have at least 2 options' })
  @ValidateNested({ each: true })
  @Type(() => CreateOptionDto)
  options?: CreateOptionDto[];
}

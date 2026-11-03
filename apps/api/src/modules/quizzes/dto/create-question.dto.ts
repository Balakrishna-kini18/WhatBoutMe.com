import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { QuestionType } from '@prisma/client';

export class CreateOptionDto {
  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsBoolean()
  isCorrect: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  order?: number;
}

export class CreateQuestionDto {
  @IsString()
  @MinLength(1, { message: 'Question text is required' })
  text: string;

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

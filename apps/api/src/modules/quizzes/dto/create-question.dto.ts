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
  @IsString()
  @IsNotEmpty({ message: 'Option text is required' })
  text: string;

  @IsBoolean()
  isCorrect: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  order?: number;
}

export class CreateQuestionDto {
  @IsString()
  @IsNotEmpty({ message: 'Question text is required' })
  @MinLength(5, { message: 'Question text must be at least 5 characters long' })
  text: string;

  @IsOptional()
  @IsEnum(QuestionType, { message: 'Type must be a valid QuestionType (MULTIPLE_CHOICE, MULTI_SELECT, SHORT_ANSWER)' })
  type?: QuestionType;

  @IsOptional()
  @IsString()
  explanation?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  points?: number;

  @IsArray()
  @ArrayMinSize(2, { message: 'A question must have at least 2 options' })
  @ValidateNested({ each: true })
  @Type(() => CreateOptionDto)
  options: CreateOptionDto[];
}

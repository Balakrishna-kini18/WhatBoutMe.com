import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class QuizAnswerSubmissionDto {
  @IsUUID('4', { message: 'questionId must be a valid UUID' })
  @IsNotEmpty({ message: 'questionId is required' })
  questionId: string;

  @IsOptional()
  @IsString({ message: 'optionId must be a string' })
  optionId?: string;

  @IsOptional()
  @IsString({ message: 'selectedOptionId must be a string' })
  selectedOptionId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true, message: 'Each optionId must be a string' })
  optionIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true, message: 'Each selectedOptionId must be a string' })
  selectedOptionIds?: string[];

  @IsOptional()
  @IsString()
  textAnswer?: string;

  @IsOptional()
  @IsString()
  textResponse?: string;
}

export class SubmitQuizDto {
  @IsOptional()
  @IsUUID('4', { message: 'attemptId must be a valid UUID' })
  attemptId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'id must be a valid UUID' })
  id?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuizAnswerSubmissionDto)
  answers: QuizAnswerSubmissionDto[];
}

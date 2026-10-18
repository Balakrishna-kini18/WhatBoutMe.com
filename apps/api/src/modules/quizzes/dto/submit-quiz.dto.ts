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
  @IsUUID('4', { message: 'optionId must be a valid UUID' })
  optionId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'selectedOptionId must be a valid UUID' })
  selectedOptionId?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true, message: 'Each optionId must be a valid UUID' })
  optionIds?: string[];

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true, message: 'Each selectedOptionId must be a valid UUID' })
  selectedOptionIds?: string[];

  @IsOptional()
  @IsString()
  textAnswer?: string;

  @IsOptional()
  @IsString()
  textResponse?: string;
}

export class SubmitQuizDto {
  @IsUUID('4', { message: 'attemptId must be a valid UUID' })
  @IsNotEmpty({ message: 'attemptId is required' })
  attemptId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuizAnswerSubmissionDto)
  answers: QuizAnswerSubmissionDto[];
}

import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ExamAnswerSubmissionDto {
  @IsString({ message: 'questionId must be a string' })
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

export class SubmitExamDto {
  @IsOptional()
  @IsString({ message: 'attemptId must be a string' })
  attemptId?: string;

  @IsOptional()
  @IsString({ message: 'id must be a string' })
  id?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExamAnswerSubmissionDto)
  answers: ExamAnswerSubmissionDto[];
}

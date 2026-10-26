import { IsArray, IsInt, IsOptional, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ExamAnswerSubmissionDto } from './submit-exam.dto.js';

export class SaveExamAnswersDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExamAnswerSubmissionDto)
  answers: ExamAnswerSubmissionDto[];

  @IsOptional()
  @IsInt()
  @Min(0)
  currentQuestionIndex?: number;
}

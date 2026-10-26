import { IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ExamAnswerSubmissionDto } from './submit-exam.dto.js';

export class SaveExamAnswersDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExamAnswerSubmissionDto)
  answers: ExamAnswerSubmissionDto[];
}

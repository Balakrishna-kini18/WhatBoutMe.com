import { IsOptional, IsString } from 'class-validator';

export class ReviewMissionStatementDto {
  @IsString()
  @IsOptional()
  feedback?: string;
}

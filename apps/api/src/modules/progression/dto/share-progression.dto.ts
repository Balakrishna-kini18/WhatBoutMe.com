import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateProgressShareDto {
  @IsString()
  @IsNotEmpty({ message: 'enrolmentId must not be empty' })
  enrolmentId: string;

  @IsOptional()
  @IsBoolean()
  showProgressPercent?: boolean;

  @IsOptional()
  @IsBoolean()
  showMilestone?: boolean;

  @IsOptional()
  @IsBoolean()
  showName?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'Custom message must not exceed 200 characters' })
  customMessage?: string;
}

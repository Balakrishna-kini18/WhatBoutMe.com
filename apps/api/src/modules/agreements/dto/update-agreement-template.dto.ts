import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateAgreementTemplateDto {
  @IsString()
  @IsOptional()
  @MinLength(3)
  @MaxLength(200)
  title?: string;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  description?: string;
}

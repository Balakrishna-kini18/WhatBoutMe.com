import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateTemplateVersionDto {
  @IsString()
  @IsOptional()
  @MinLength(10, { message: 'Agreement content must be at least 10 characters long' })
  content?: string;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  changelog?: string;
}

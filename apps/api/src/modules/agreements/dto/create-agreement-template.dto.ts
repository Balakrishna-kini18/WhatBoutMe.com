import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateAgreementTemplateDto {
  @IsUUID()
  @IsNotEmpty()
  programId: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(200)
  title: string;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  description?: string;

  @IsString()
  @IsOptional()
  @Matches(/^v?\d+(\.\d+)*$/i, {
    message: 'Version must be formatted like "v1.0", "v2.0", "1.0", or "v1.1"',
  })
  initialVersion?: string;

  @IsString()
  @IsOptional()
  @MinLength(10, { message: 'Agreement content must be at least 10 characters long' })
  initialContent?: string;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  initialChangelog?: string;

  @IsBoolean()
  @IsOptional()
  publishImmediately?: boolean;
}


import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ContentStatus } from '@prisma/client';

export class CreateTemplateVersionDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^v?\d+(\.\d+)*$/i, {
    message: 'Version must be formatted like "v1.0", "v2.0", "1.0", or "v1.1"',
  })
  version: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(10, { message: 'Agreement content must be at least 10 characters long' })
  content: string;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  changelog?: string;

  @IsEnum(ContentStatus)
  @IsOptional()
  status?: ContentStatus = ContentStatus.DRAFT;
}

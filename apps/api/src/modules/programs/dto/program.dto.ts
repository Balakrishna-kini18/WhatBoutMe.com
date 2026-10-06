import { IsString, IsNotEmpty, IsNumber, IsBoolean, IsOptional, IsEnum, Min } from 'class-validator';
import { ContentStatus } from '@prisma/client';

export class CreateProgramDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  slug?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNumber()
  @Min(0)
  price: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsEnum(ContentStatus)
  status?: ContentStatus;

  @IsOptional()
  @IsBoolean()
  hasCertificate?: boolean;

  @IsOptional()
  @IsString()
  certificateTemplate?: string;
}

export class UpdateProgramDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  title?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  slug?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  hasCertificate?: boolean;

  @IsOptional()
  @IsString()
  certificateTemplate?: string;
}

export class PublishProgramDto {
  @IsEnum(ContentStatus)
  status: ContentStatus;
}

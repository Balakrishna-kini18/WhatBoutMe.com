import { IsString, IsNotEmpty, IsNumber, IsBoolean, IsOptional, IsEnum, IsDateString, Min, IsArray } from 'class-validator';
import { ContentStatus, CurrencyCode } from '@prisma/client';

export class CourseFaqItemDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  @IsNotEmpty()
  question: string;

  @IsString()
  @IsNotEmpty()
  answer: string;

  @IsOptional()
  @IsNumber()
  sortOrder?: number;
}

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
  @IsEnum(CurrencyCode)
  currency?: CurrencyCode;

  @IsOptional()
  @IsNumber()
  @Min(0)
  priceUSD?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  priceAED?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  priceINR?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  earlyBirdPrice?: number;

  @IsOptional()
  @IsEnum(CurrencyCode)
  earlyBirdCurrency?: CurrencyCode;

  @IsOptional()
  @IsDateString()
  earlyBirdDeadline?: string;

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

  @IsOptional()
  @IsString()
  shortDescription?: string;

  @IsOptional()
  @IsString()
  thumbnailUrl?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  level?: string;

  @IsOptional()
  @IsArray()
  faqs?: CourseFaqItemDto[];
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
  @IsEnum(CurrencyCode)
  currency?: CurrencyCode;

  @IsOptional()
  @IsNumber()
  @Min(0)
  priceUSD?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  priceAED?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  priceINR?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  earlyBirdPrice?: number;

  @IsOptional()
  @IsEnum(CurrencyCode)
  earlyBirdCurrency?: CurrencyCode;

  @IsOptional()
  @IsDateString()
  earlyBirdDeadline?: string;

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

  @IsOptional()
  @IsString()
  shortDescription?: string;

  @IsOptional()
  @IsString()
  thumbnailUrl?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  level?: string;

  @IsOptional()
  @IsArray()
  faqs?: CourseFaqItemDto[];
}

export class PublishProgramDto {
  @IsEnum(ContentStatus)
  status: ContentStatus;
}

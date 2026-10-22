import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  IsBoolean,
  Min,
  Max,
} from 'class-validator';
import { ResourceItemType, ResourceAccessScope } from '@prisma/client';

export class UpdateResourceDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(ResourceItemType)
  @IsOptional()
  type?: ResourceItemType;

  @IsString()
  @IsOptional()
  categoryId?: string;

  @IsString()
  @IsOptional()
  storageKey?: string;

  @IsString()
  @IsOptional()
  mimeType?: string;

  @IsNumber()
  @IsOptional()
  @Min(1)
  fileSizeBytes?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  durationSeconds?: number;

  @IsNumber()
  @IsOptional()
  @Min(1)
  pageCount?: number;

  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(11)
  stepTagNumber?: number;

  @IsEnum(ResourceAccessScope)
  @IsOptional()
  accessScope?: ResourceAccessScope;

  @IsString()
  @IsOptional()
  programId?: string;

  @IsString()
  @IsOptional()
  batchId?: string;

  @IsString()
  @IsOptional()
  requiredStepId?: string;

  @IsBoolean()
  @IsOptional()
  isPublished?: boolean;

  @IsBoolean()
  @IsOptional()
  viewOnlyProtected?: boolean;
}

import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsNumber,
  IsBoolean,
  Min,
  Max,
} from 'class-validator';
import { ResourceItemType, ResourceAccessScope } from '@prisma/client';

export class CreateResourceDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(ResourceItemType)
  type: ResourceItemType;

  @IsString()
  @IsNotEmpty()
  categoryId: string;

  @IsString()
  @IsNotEmpty()
  storageKey: string;

  @IsString()
  @IsNotEmpty()
  mimeType: string;

  @IsNumber()
  @Min(1)
  fileSizeBytes: number;

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
  accessScope?: ResourceAccessScope = ResourceAccessScope.ALL_ENROLLED;

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
  isPublished?: boolean = true;

  @IsBoolean()
  @IsOptional()
  viewOnlyProtected?: boolean;
}

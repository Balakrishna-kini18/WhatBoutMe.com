import { IsString, IsOptional, IsEnum, IsNumber, IsBoolean } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ResourceItemType, ResourceAccessScope } from '@prisma/client';

export class QueryResourceDto {
  @IsString()
  @IsOptional()
  categoryId?: string;

  @IsEnum(ResourceItemType)
  @IsOptional()
  type?: ResourceItemType;

  @IsEnum(ResourceAccessScope)
  @IsOptional()
  accessScope?: ResourceAccessScope;

  @IsString()
  @IsOptional()
  programId?: string;

  @IsString()
  @IsOptional()
  batchId?: string;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  stepTagNumber?: number;

  @IsString()
  @IsOptional()
  search?: string;

  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  isPublished?: boolean;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  limit?: number = 50;
}

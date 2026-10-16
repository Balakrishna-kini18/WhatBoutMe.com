import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateGalleryItemDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  title!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsNotEmpty()
  imageUrl!: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  altText?: string;

  @IsString()
  @IsOptional()
  @MaxLength(60)
  category?: string;

  @IsInt()
  @IsOptional()
  @Type(() => Number)
  displayOrder?: number;

  @IsBoolean()
  @IsOptional()
  isPublished?: boolean;
}

export class UpdateGalleryItemDto {
  @IsString()
  @IsOptional()
  @MaxLength(160)
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  imageUrl?: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  altText?: string;

  @IsString()
  @IsOptional()
  @MaxLength(60)
  category?: string;

  @IsInt()
  @IsOptional()
  @Type(() => Number)
  displayOrder?: number;

  @IsBoolean()
  @IsOptional()
  isPublished?: boolean;
}

export class ListGalleryQueryDto {
  @IsString()
  @IsOptional()
  category?: string;

  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  isPublished?: boolean;

  @IsString()
  @IsOptional()
  search?: string;
}

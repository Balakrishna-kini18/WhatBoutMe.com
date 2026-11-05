import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  Min,
  IsBoolean,
  IsArray,
  IsDateString,
  Matches,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { CouponDiscountType, CouponScope, CouponCurrency } from '@prisma/client';

export class UpdateCouponDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase().replace(/\s+/g, '-') : value))
  @IsString()
  @IsOptional()
  @Matches(/^[A-Za-z0-9_-]{3,30}$/, {
    message: 'Coupon code must be 3-30 characters alphanumeric, dashes, or underscores',
  })
  code?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(CouponDiscountType)
  @IsOptional()
  discountType?: CouponDiscountType;

  @IsNumber()
  @Min(0.01)
  @IsOptional()
  @Type(() => Number)
  discountValue?: number;

  @IsEnum(CouponCurrency)
  @IsOptional()
  currency?: CouponCurrency;

  @IsEnum(CouponScope)
  @IsOptional()
  scope?: CouponScope;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  programIds?: string[];

  @IsNumber()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  maxTotalUses?: number;

  @IsNumber()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  maxUsesPerUser?: number;

  @IsDateString()
  @IsOptional()
  validFrom?: string;

  @IsDateString()
  @IsOptional()
  expiresAt?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsBoolean()
  @IsOptional()
  appliesToInstalments?: boolean;

  @IsString()
  @IsOptional()
  stripeCouponId?: string;

  @IsString()
  @IsOptional()
  stripePromotionCodeId?: string;
}

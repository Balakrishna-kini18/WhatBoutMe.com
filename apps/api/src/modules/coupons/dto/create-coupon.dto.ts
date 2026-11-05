import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsNumber,
  Min,
  Max,
  IsBoolean,
  IsArray,
  IsDateString,
  Matches,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { CouponDiscountType, CouponScope, CouponCurrency } from '@prisma/client';

export class CreateCouponDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase().replace(/\s+/g, '-') : value))
  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Za-z0-9_-]{3,30}$/, {
    message: 'Coupon code must be 3-30 characters alphanumeric, dashes, or underscores',
  })
  code: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(CouponDiscountType)
  discountType: CouponDiscountType;

  @IsNumber()
  @Min(0.01)
  @Type(() => Number)
  discountValue: number;

  @IsEnum(CouponCurrency)
  @IsOptional()
  currency?: CouponCurrency = CouponCurrency.ALL;

  @IsEnum(CouponScope)
  @IsOptional()
  scope?: CouponScope = CouponScope.ALL_COURSES;

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
  maxUsesPerUser?: number = 1;

  @IsDateString()
  @IsOptional()
  validFrom?: string;

  @IsDateString()
  @IsOptional()
  expiresAt?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean = true;

  @IsBoolean()
  @IsOptional()
  appliesToInstalments?: boolean = false;

  @IsString()
  @IsOptional()
  stripeCouponId?: string;

  @IsString()
  @IsOptional()
  stripePromotionCodeId?: string;
}

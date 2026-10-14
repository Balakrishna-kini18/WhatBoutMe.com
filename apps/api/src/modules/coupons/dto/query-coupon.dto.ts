import { IsOptional, IsString, IsEnum, IsBoolean, IsInt, Min } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { CouponDiscountType, CouponScope, CouponCurrency } from '@prisma/client';

export class QueryCouponDto {
  @IsString()
  @IsOptional()
  search?: string;

  @IsEnum(CouponDiscountType)
  @IsOptional()
  discountType?: CouponDiscountType;

  @IsEnum(CouponScope)
  @IsOptional()
  scope?: CouponScope;

  @IsEnum(CouponCurrency)
  @IsOptional()
  currency?: CouponCurrency;

  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  isActive?: boolean;

  @IsInt()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  @IsInt()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  limit?: number = 20;
}

import { IsString, IsNotEmpty, IsOptional, IsNumber, Min } from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class ValidateCouponDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase().replace(/\s+/g, '-') : value))
  @IsString()
  @IsNotEmpty()
  code: string;

  @IsString()
  @IsNotEmpty()
  programId: string;

  @IsString()
  @IsNotEmpty()
  currency: string; // e.g., 'INR', 'AED', 'USD'

  @IsString()
  @IsOptional()
  userId?: string;

  @IsString()
  @IsOptional()
  paymentPlanType?: 'FULL' | 'INSTALMENT' = 'FULL';

  @IsNumber()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  amount?: number;
}

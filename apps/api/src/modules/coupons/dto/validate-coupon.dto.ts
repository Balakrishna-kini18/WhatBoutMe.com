import { IsString, IsNotEmpty, IsOptional, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ValidateCouponDto {
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

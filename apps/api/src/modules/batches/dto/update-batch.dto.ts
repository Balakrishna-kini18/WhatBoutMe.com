import {
  IsString,
  IsNotEmpty,
  IsInt,
  IsDateString,
  IsOptional,
  Min,
  IsEnum,
  ValidateIf,
} from 'class-validator';
import { BatchStatus, CurrencyCode } from '@prisma/client';

export class UpdateBatchDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  programId?: string;

  @IsOptional()
  @ValidateIf((_, val) => val !== null && val !== undefined && val !== '')
  @IsString()
  managerId?: string | null;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsDateString()
  registrationDeadline?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;

  @IsOptional()
  @IsEnum(BatchStatus)
  status?: BatchStatus;

  @IsOptional()
  price?: number;

  @IsOptional()
  @IsEnum(CurrencyCode)
  currency?: CurrencyCode;

  @IsOptional()
  priceUSD?: number;

  @IsOptional()
  priceAED?: number;

  @IsOptional()
  priceINR?: number;
}

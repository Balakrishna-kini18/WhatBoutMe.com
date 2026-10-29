import {
  IsString,
  IsNotEmpty,
  IsInt,
  IsDateString,
  IsOptional,
  Min,
  IsEnum,
  IsArray,
  ArrayUnique,
} from 'class-validator';
import { BatchStatus, CurrencyCode } from '@prisma/client';

export class CreateBatchDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  programId: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  managerId?: string;

  @IsDateString()
  startDate: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsDateString()
  registrationDeadline?: string;

  @IsInt()
  @Min(1)
  capacity: number;

  @IsOptional()
  @IsEnum(BatchStatus)
  status?: BatchStatus;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  trainerIds?: string[];

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

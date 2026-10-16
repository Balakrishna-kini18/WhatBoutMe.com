import {
  IsString,
  IsNotEmpty,
  IsInt,
  IsDateString,
  IsOptional,
  Min,
  IsEnum,
} from 'class-validator';
import { BatchStatus } from '@prisma/client';

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
  @IsString()
  managerId?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;

  @IsOptional()
  @IsEnum(BatchStatus)
  status?: BatchStatus;
}

import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum SignedRecordsTab {
  COMPLETED = 'COMPLETED',
  PENDING_PAYMENT = 'PENDING_PAYMENT',
  ALL = 'ALL',
}

export enum SignedPaymentStatusFilter {
  PAID = 'PAID',
  PENDING = 'PENDING',
  REFUNDED = 'REFUNDED',
  FAILED = 'FAILED',
  ALL = 'ALL',
}

export enum SignedScopeFilter {
  PROGRAM = 'PROGRAM',
  SHARED_DEFAULT = 'SHARED_DEFAULT',
  ALL = 'ALL',
}

export class QuerySignedAgreementsDto {
  @IsOptional()
  @IsEnum(SignedRecordsTab)
  tab?: SignedRecordsTab = SignedRecordsTab.COMPLETED;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  programId?: string;

  @IsOptional()
  @IsString()
  enrolmentStatus?: string;

  @IsOptional()
  @IsEnum(SignedPaymentStatusFilter)
  paymentStatus?: SignedPaymentStatusFilter;

  @IsOptional()
  @IsEnum(SignedScopeFilter)
  scope?: SignedScopeFilter;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;
}

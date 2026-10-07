import { IsEnum, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';

export enum PaymentMode {
  OFFLINE = 'OFFLINE',
  STRIPE = 'STRIPE',
  COMPLIMENTARY = 'COMPLIMENTARY',
}

export class CreateEnrolmentDto {
  @IsUUID()
  @IsNotEmpty()
  userId: string;

  @IsUUID()
  @IsNotEmpty()
  programId: string;

  @IsUUID()
  @IsNotEmpty()
  batchId: string;

  @IsEnum(PaymentMode)
  @IsOptional()
  paymentMode?: PaymentMode = PaymentMode.STRIPE;
}

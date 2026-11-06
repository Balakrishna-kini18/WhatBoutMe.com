import { IsEnum, IsNotEmpty, IsOptional, IsString, IsNumber, Min } from 'class-validator';

export class CreateCheckoutSessionDto {
  @IsEnum(['ENROLMENT', 'EVENT', 'SEAT_POOL'], {
    message: 'targetType must be ENROLMENT, EVENT, or SEAT_POOL',
  })
  @IsNotEmpty()
  targetType: 'ENROLMENT' | 'EVENT' | 'SEAT_POOL';

  @IsString()
  @IsNotEmpty()
  targetId: string;

  @IsString()
  @IsOptional()
  enrolmentId?: string;

  @IsString()
  @IsOptional()
  poolId?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  amount?: number;

  @IsEnum(['USD', 'AED', 'INR'], {
    message: 'currency must be USD, AED, or INR',
  })
  @IsOptional()
  currency?: 'USD' | 'AED' | 'INR';

  @IsString()
  @IsOptional()
  couponCode?: string;

  @IsString()
  @IsOptional()
  idempotencyKey?: string;

  @IsString()
  @IsOptional()
  attendeeName?: string;

  @IsString()
  @IsOptional()
  attendeeEmail?: string;

  @IsString()
  @IsOptional()
  attendeePhone?: string;
}

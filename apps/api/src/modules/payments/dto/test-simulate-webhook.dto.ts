import { IsEnum, IsNotEmpty, IsOptional, IsString, IsNumber, Min } from 'class-validator';

export class TestSimulateWebhookDto {
  @IsEnum(['ENROLMENT', 'EVENT', 'SEAT_POOL'], {
    message: 'targetType must be ENROLMENT, EVENT, or SEAT_POOL',
  })
  @IsNotEmpty()
  targetType: 'ENROLMENT' | 'EVENT' | 'SEAT_POOL';

  @IsString()
  @IsOptional()
  targetId?: string;

  @IsString()
  @IsOptional()
  poolId?: string;

  @IsString()
  @IsOptional()
  enrolmentId?: string;

  @IsString()
  @IsOptional()
  eventId?: string;

  @IsString()
  @IsOptional()
  registrationId?: string;

  @IsString()
  @IsOptional()
  eventRegistrationId?: string;

  @IsString()
  @IsOptional()
  userId?: string;

  @IsString()
  @IsOptional()
  idempotencyKey?: string;

  @IsString()
  @IsOptional()
  stripeSessionId?: string;

  @IsEnum(['PAID', 'FAILED'], {
    message: 'status must be either PAID or FAILED',
  })
  @IsNotEmpty()
  status: 'PAID' | 'FAILED';

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
  attendeeName?: string;

  @IsString()
  @IsOptional()
  attendeeEmail?: string;

  @IsString()
  @IsOptional()
  attendeePhone?: string;

  @IsString()
  @IsOptional()
  failureReason?: string;

  @IsString()
  @IsOptional()
  chargedCurrency?: string;

  @IsNumber()
  @IsOptional()
  chargedAmountMinor?: number;

  @IsString()
  @IsOptional()
  fxRate?: string;
}

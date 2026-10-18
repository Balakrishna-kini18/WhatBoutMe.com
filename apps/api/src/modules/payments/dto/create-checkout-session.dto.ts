import { IsEnum, IsNotEmpty, IsOptional, IsString, IsNumber, Min } from 'class-validator';

export class CreateCheckoutSessionDto {
  @IsEnum(['ENROLMENT', 'EVENT'], {
    message: 'targetType must be either ENROLMENT or EVENT',
  })
  @IsNotEmpty()
  targetType: 'ENROLMENT' | 'EVENT';

  @IsString()
  @IsNotEmpty()
  targetId: string;

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

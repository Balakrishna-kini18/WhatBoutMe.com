import { CurrencyCode, EventLocationType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateEventDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(250)
  title!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20000)
  description!: string;

  @IsDateString()
  startDateTime!: string;

  @IsOptional()
  @IsDateString()
  endDateTime?: string;

  // Backwards compatibility alias for startDateTime
  @IsOptional()
  @IsDateString()
  startAt?: string;

  // Backwards compatibility alias for endDateTime
  @IsOptional()
  @IsDateString()
  endAt?: string;

  @IsOptional()
  @IsDateString()
  startDateTimeUtc?: string;

  @IsOptional()
  @IsDateString()
  endDateTimeUtc?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  timezone?: string;

  @IsEnum(EventLocationType)
  locationType!: EventLocationType;

  @IsOptional()
  @IsUrl()
  meetingLink?: string;

  @IsOptional()
  @IsUrl()
  onlineMeetingLink?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  venueName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  venueAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  physicalAddress?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsEnum(CurrencyCode)
  currency?: CurrencyCode;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000000)
  seatLimit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000000)
  capacity?: number;

  // Backwards compatibility alias for seatLimit
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxRegistrations?: number;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;

  @IsOptional()
  @IsString()
  bannerUrl?: string;

  // Backwards compatibility alias for bannerUrl
  @IsOptional()
  @IsString()
  coverImageUrl?: string;
}

export class UpdateEventDto {
  @IsOptional()
  @IsString()
  @MaxLength(250)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  description?: string;

  @IsOptional()
  @IsDateString()
  startDateTime?: string;

  @IsOptional()
  @IsDateString()
  endDateTime?: string;

  @IsOptional()
  @IsDateString()
  startAt?: string;

  @IsOptional()
  @IsDateString()
  endAt?: string;

  @IsOptional()
  @IsDateString()
  startDateTimeUtc?: string;

  @IsOptional()
  @IsDateString()
  endDateTimeUtc?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  timezone?: string;

  @IsOptional()
  @IsEnum(EventLocationType)
  locationType?: EventLocationType;

  @IsOptional()
  @IsUrl()
  meetingLink?: string;

  @IsOptional()
  @IsUrl()
  onlineMeetingLink?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  venueName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  venueAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  physicalAddress?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsEnum(CurrencyCode)
  currency?: CurrencyCode;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000000)
  seatLimit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000000)
  capacity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxRegistrations?: number;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;

  @IsOptional()
  @IsString()
  bannerUrl?: string;

  @IsOptional()
  @IsString()
  coverImageUrl?: string;
}

export class CheckoutEventDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  attendeeName?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  attendeeEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  attendeePhone?: string;

  // Optional backwards compatibility aliases
  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  origin?: string;

  @IsOptional()
  @IsString()
  returnUrl?: string;
}

export class VerifyEventPaymentDto {
  @IsString()
  @IsNotEmpty()
  registrationId!: string;

  @IsOptional()
  @IsString()
  gatewayOrderId?: string;

  @IsOptional()
  @IsString()
  gatewayPaymentId?: string;

  @IsOptional()
  @IsBoolean()
  simulation?: boolean;

  @IsOptional()
  @IsBoolean()
  isSimulated?: boolean;
}

export class RejectEventRegistrationDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

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
  @IsString()
  @MaxLength(80)
  timezone?: string;

  @IsEnum(EventLocationType)
  locationType!: EventLocationType;

  @IsOptional()
  @IsUrl()
  meetingLink?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  venueName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  venueAddress?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsEnum(CurrencyCode)
  currency?: CurrencyCode;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000000)
  seatLimit?: number;

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
  @IsString()
  @MaxLength(300)
  venueName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  venueAddress?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price?: number;

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
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  attendeeName!: string;

  @IsEmail()
  @IsNotEmpty()
  @MaxLength(200)
  attendeeEmail!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  attendeePhone!: string;

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
}

export class RejectEventRegistrationDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

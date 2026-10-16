import { EventStatus, EventType, ParticipantCategory } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class CreateEventDto {
  @IsEnum(EventType)
  type!: EventType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  description!: string;

  @IsDateString()
  startAt!: string;

  @IsDateString()
  endAt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  location?: string;

  @IsOptional()
  @IsUrl()
  meetingLink?: string;

  @IsOptional()
  @IsUrl()
  coverImageUrl?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  maxRegistrations?: number;

  @IsOptional()
  @IsEnum(EventStatus)
  status?: EventStatus;

  @IsOptional()
  @IsDateString()
  registrationOpensAt?: string;

  @IsOptional()
  @IsDateString()
  registrationClosesAt?: string;
}

export class UpdateEventDto {
  @IsOptional()
  @IsEnum(EventType)
  type?: EventType;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  description?: string;

  @IsOptional()
  @IsDateString()
  startAt?: string;

  @IsOptional()
  @IsDateString()
  endAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  location?: string;

  @IsOptional()
  @IsUrl()
  meetingLink?: string;

  @IsOptional()
  @IsUrl()
  coverImageUrl?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  maxRegistrations?: number;

  @IsOptional()
  @IsDateString()
  registrationOpensAt?: string;

  @IsOptional()
  @IsDateString()
  registrationClosesAt?: string;
}

export class UpdateEventStatusDto {
  @IsEnum(EventStatus)
  status!: EventStatus;
}

export class RejectEventRegistrationDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class RegisterEventDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  fullName!: string;

  @IsEmail()
  @IsNotEmpty()
  @MaxLength(200)
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  phone!: string;

  @IsEnum(ParticipantCategory)
  category!: ParticipantCategory;

  @ValidateIf((dto: RegisterEventDto) => dto.category === ParticipantCategory.OTHER)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  categoryOther?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  organization?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;
}

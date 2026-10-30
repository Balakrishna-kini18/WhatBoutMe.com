import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  CurrencyCode,
  OneOnOneSessionStatus,
  OrganizationStatus,
  OrganizationType,
  OrgMemberRole,
  SeatPaymentMethod,
  SeatRedemptionMode,
  SeatStatus,
} from '@prisma/client';

export class CreateOrganizationDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  slug?: string;

  @IsString()
  @IsOptional()
  legalName?: string;

  @IsEnum(OrganizationType)
  @IsOptional()
  orgType?: OrganizationType = OrganizationType.CORPORATE;

  @IsString()
  @IsOptional()
  logoUrl?: string;

  @IsString()
  @IsOptional()
  website?: string;

  @IsString()
  @IsOptional()
  country?: string;

  @IsString()
  @IsOptional()
  timezone?: string = 'UTC';

  @IsString()
  @IsNotEmpty()
  contactPersonName: string;

  @IsEmail()
  @IsNotEmpty()
  contactEmail: string;

  @IsString()
  @IsOptional()
  contactPhone?: string;

  @IsEmail()
  @IsOptional()
  billingEmail?: string;

  @IsString()
  @IsOptional()
  initialPassword?: string;

  @IsBoolean()
  @IsOptional()
  sendInviteEmail?: boolean = true;

  @IsOptional()
  billingAddress?: any;

  @IsString()
  @IsOptional()
  taxId?: string;

  @IsEnum(CurrencyCode)
  @IsOptional()
  defaultCurrency?: CurrencyCode = CurrencyCode.USD;

  @IsInt()
  @IsOptional()
  @Min(0)
  paymentTermsDays?: number = 30;

  @IsBoolean()
  @IsOptional()
  isAuthorizedReseller?: boolean = false;

  @IsBoolean()
  @IsOptional()
  showSponsorOnCertificate?: boolean = true;

  @IsString()
  @IsOptional()
  sponsorDisplayName?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  allowedEmailDomains?: string[] = [];

  @IsBoolean()
  @IsOptional()
  shareExamNumericScores?: boolean = true;

  @IsString()
  @IsOptional()
  internalAdminNotes?: string;

  // Primary Owner Onboarding
  @IsUUID()
  @IsOptional()
  ownerUserId?: string;

  @IsEmail()
  @IsOptional()
  ownerEmail?: string;

  @IsString()
  @IsOptional()
  ownerName?: string;
}

export class UpdateOrganizationDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  slug?: string;

  @IsString()
  @IsOptional()
  legalName?: string;

  @IsEnum(OrganizationType)
  @IsOptional()
  orgType?: OrganizationType;

  @IsEnum(OrganizationStatus)
  @IsOptional()
  status?: OrganizationStatus;

  @IsString()
  @IsOptional()
  logoUrl?: string;

  @IsString()
  @IsOptional()
  website?: string;

  @IsString()
  @IsOptional()
  country?: string;

  @IsString()
  @IsOptional()
  timezone?: string;

  @IsString()
  @IsOptional()
  contactPersonName?: string;

  @IsEmail()
  @IsOptional()
  contactEmail?: string;

  @IsString()
  @IsOptional()
  contactPhone?: string;

  @IsEmail()
  @IsOptional()
  billingEmail?: string;

  @IsOptional()
  billingAddress?: any;

  @IsString()
  @IsOptional()
  taxId?: string;

  @IsEnum(CurrencyCode)
  @IsOptional()
  defaultCurrency?: CurrencyCode;

  @IsInt()
  @IsOptional()
  @Min(0)
  paymentTermsDays?: number;

  @IsBoolean()
  @IsOptional()
  isAuthorizedReseller?: boolean;

  @IsBoolean()
  @IsOptional()
  showSponsorOnCertificate?: boolean;

  @IsString()
  @IsOptional()
  sponsorDisplayName?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  allowedEmailDomains?: string[];

  @IsBoolean()
  @IsOptional()
  shareExamNumericScores?: boolean;

  @IsString()
  @IsOptional()
  internalAdminNotes?: string;
}

export class CreateSeatPoolDto {
  @IsUUID()
  @IsNotEmpty()
  batchId: string;

  @IsUUID()
  @IsOptional()
  programId?: string;

  @IsInt()
  @Min(1)
  totalSeats: number;

  @IsEnum(SeatPaymentMethod)
  @IsOptional()
  paymentMethod?: SeatPaymentMethod = SeatPaymentMethod.ONLINE;

  @IsEnum(CurrencyCode)
  @IsOptional()
  currency?: CurrencyCode = CurrencyCode.USD;

  @IsNumber()
  @IsOptional()
  customPricePerSeat?: number;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class AssignSeatDto {
  @IsUUID()
  @IsNotEmpty()
  seatId: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsOptional()
  fullName?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  department?: string;

  @IsString()
  @IsOptional()
  externalOrderRef?: string;

  @IsNumber()
  @IsOptional()
  resalePrice?: number;

  @IsEnum(SeatRedemptionMode)
  @IsOptional()
  redemptionMode?: SeatRedemptionMode = SeatRedemptionMode.EMAIL_INVITE;

  @IsString()
  @IsOptional()
  orgInternalNotes?: string;
}

export class InviteItemDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsOptional()
  fullName?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  department?: string;

  @IsString()
  @IsOptional()
  externalOrderRef?: string;
}

export class BulkInviteDto {
  @IsUUID()
  @IsNotEmpty()
  seatPoolId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InviteItemDto)
  invites: InviteItemDto[];

  @IsEnum(SeatRedemptionMode)
  @IsOptional()
  redemptionMode?: SeatRedemptionMode = SeatRedemptionMode.EMAIL_INVITE;
}

export class SeatPoolCheckoutDto {
  @IsUUID()
  @IsNotEmpty()
  batchId: string;

  @IsInt()
  @Min(1)
  seatsCount: number;

  @IsEnum(CurrencyCode)
  @IsOptional()
  currency?: CurrencyCode = CurrencyCode.USD;

  @IsEnum(SeatPaymentMethod)
  @IsOptional()
  paymentMethod?: SeatPaymentMethod = SeatPaymentMethod.ONLINE;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class UpdateOneOnOneDto {
  @IsEnum(OneOnOneSessionStatus)
  @IsOptional()
  status?: OneOnOneSessionStatus;

  @IsString()
  @IsOptional()
  scheduledAt?: string;

  @IsString()
  @IsOptional()
  facilitatorId?: string;

  @IsString()
  @IsOptional()
  facilitatorName?: string;

  @IsString()
  @IsOptional()
  meetingUrl?: string;

  @IsString()
  @IsOptional()
  adminNotes?: string;
}

export class AddOrgMemberDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsEnum(OrgMemberRole)
  @IsOptional()
  role?: OrgMemberRole = OrgMemberRole.VIEWER;

  @IsString()
  @IsOptional()
  title?: string;
}


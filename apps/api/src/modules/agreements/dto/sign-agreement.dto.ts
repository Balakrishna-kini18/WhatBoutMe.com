import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

export class SignAgreementDto {
  @IsUUID()
  @IsNotEmpty()
  enrolmentId!: string;

  @IsOptional()
  @IsUUID()
  versionId?: string;

  @IsOptional()
  @IsBoolean()
  consentGiven?: boolean;

  @IsOptional()
  @IsBoolean()
  consentAccepted?: boolean;

  @IsOptional()
  @IsString()
  typedName?: string;

  @IsOptional()
  @IsString()
  signerName?: string;

  @IsOptional()
  @IsString()
  drawnSignature?: string;

  @IsOptional()
  @IsString()
  signatureImage?: string;

  @IsOptional()
  @IsString()
  signatureData?: string;

  @IsOptional()
  @IsIn(['DRAWN', 'UPLOADED'])
  signatureType?: 'DRAWN' | 'UPLOADED';

  @IsOptional()
  @IsString()
  consentVersion?: string;

  @IsOptional()
  @IsString()
  consentTimestamp?: string;

  @IsOptional()
  @IsBoolean()
  useSavedSignature?: boolean;

  @IsOptional()
  @IsBoolean()
  updateProfileSignature?: boolean;
}

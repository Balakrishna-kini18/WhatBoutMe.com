import { IsBoolean, IsNotEmpty, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class SignAgreementDto {
  @IsUUID()
  @IsNotEmpty()
  enrolmentId!: string;

  @IsOptional()
  @IsUUID()
  versionId?: string;

  @IsBoolean()
  @IsNotEmpty()
  consentGiven!: boolean;

  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  typedName!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(5)
  drawnSignature!: string;
}

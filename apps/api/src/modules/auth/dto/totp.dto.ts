import { IsString, IsNotEmpty, Length, IsOptional } from 'class-validator';

export class TotpSetupDto {
  @IsString()
  @IsNotEmpty({ message: 'Verification code is required' })
  @Length(6, 6, { message: 'TOTP code must be exactly 6 digits' })
  code: string;

  @IsOptional()
  @IsString()
  secret?: string;
}

export class TotpVerifyDto {
  @IsString()
  @IsNotEmpty({ message: 'Verification code is required' })
  @Length(6, 10, { message: 'Verification code must be 6 to 10 characters' })
  code: string;

  @IsOptional()
  @IsString()
  tempToken?: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  backupCode?: string;
}

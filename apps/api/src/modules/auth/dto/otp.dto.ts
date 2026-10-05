import { IsString, IsEmail, IsNotEmpty, Length } from 'class-validator';

export class OtpSendDto {
  @IsEmail({}, { message: 'Valid email is required' })
  @IsNotEmpty({ message: 'Email is required' })
  email: string;
}

export class OtpVerifyDto {
  @IsEmail({}, { message: 'Valid email is required' })
  @IsNotEmpty({ message: 'Email is required' })
  email: string;

  @IsString()
  @IsNotEmpty({ message: 'OTP code is required' })
  @Length(6, 6, { message: 'OTP code must be exactly 6 digits' })
  code: string;
}

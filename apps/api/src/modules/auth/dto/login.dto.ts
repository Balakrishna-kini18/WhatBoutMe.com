import { IsString, IsEmail, IsNotEmpty, ValidateIf, IsOptional } from 'class-validator';

export class LoginDto {
  // Sign in with either the account email or mobile phone
  @ValidateIf((o) => !o.phone)
  @IsEmail({}, { message: 'Valid email is required if phone is not provided' })
  @IsNotEmpty({ message: 'Email cannot be empty' })
  email?: string;

  @ValidateIf((o) => !o.email)
  @IsString()
  @IsNotEmpty({ message: 'Phone cannot be empty' })
  phone?: string;

  @IsString()
  @IsNotEmpty({ message: 'Password is required' })
  password: string;

  @IsOptional()
  @IsString()
  loginType?: string;
}

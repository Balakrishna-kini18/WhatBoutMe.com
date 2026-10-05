import { IsString, IsEmail, IsNotEmpty, MinLength, IsOptional } from 'class-validator';

export class PasswordResetRequestDto {
  @IsEmail({}, { message: 'Valid email is required' })
  @IsNotEmpty({ message: 'Email is required' })
  email: string;
}

export class PasswordResetConfirmDto {
  @IsString()
  @IsNotEmpty({ message: 'Password reset token is required' })
  token: string;

  @IsString()
  @IsNotEmpty({ message: 'New password is required' })
  @MinLength(8, { message: 'New password must be at least 8 characters long' })
  newPassword: string;

  @IsOptional()
  @IsString()
  password?: string;
}

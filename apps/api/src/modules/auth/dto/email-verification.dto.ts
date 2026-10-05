import { IsString, IsNotEmpty } from 'class-validator';

export class EmailVerificationDto {
  @IsString()
  @IsNotEmpty({ message: 'Verification token is required' })
  token: string;
}

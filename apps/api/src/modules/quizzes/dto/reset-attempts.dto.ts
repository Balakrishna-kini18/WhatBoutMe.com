import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class ResetAttemptsDto {
  @IsString()
  @IsNotEmpty({ message: 'Reset reason is required' })
  @MinLength(5, { message: 'Reason must be at least 5 characters long' })
  @MaxLength(500, { message: 'Reason must not exceed 500 characters' })
  reason: string;
}

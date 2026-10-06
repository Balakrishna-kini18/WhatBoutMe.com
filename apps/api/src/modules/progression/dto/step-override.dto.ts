import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class StepOverrideDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'Reason must not be blank' })
  @MinLength(5, { message: 'Reason must be at least 5 characters long' })
  @MaxLength(500, { message: 'Reason must not exceed 500 characters' })
  reason: string;
}

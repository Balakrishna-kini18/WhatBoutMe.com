import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class LinkUnmatchedDto {
  @IsString()
  @IsNotEmpty({ message: 'Target userId is required to link participant' })
  userId: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class CheckInDto {
  @IsString()
  @IsNotEmpty({ message: 'Check-in token is required' })
  token: string;
}

import { IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { AttendanceStatus } from '@prisma/client';

export class OverrideAttendanceDto {
  @IsEnum(AttendanceStatus)
  status: AttendanceStatus;

  @IsString()
  @IsNotEmpty({ message: 'A reason is required for correcting attendance.' })
  @MaxLength(1000)
  correctionReason: string;
}

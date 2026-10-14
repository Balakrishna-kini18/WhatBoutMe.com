import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, Min, MinLength, MaxLength } from 'class-validator';
import { AttendanceStatus } from '@prisma/client';

export class ManualAttendanceOverrideDto {
  @IsEnum(AttendanceStatus, {
    message: 'status must be a valid attendance status (PRESENT, ABSENT, EXCUSED, etc.)',
  })
  status: AttendanceStatus;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minutesPresent?: number;

  @IsString()
  @IsNotEmpty({ message: 'A non-empty reason is strictly required for attendance override' })
  @MinLength(3, { message: 'Reason must be at least 3 characters long' })
  @MaxLength(1000)
  reason: string;
}

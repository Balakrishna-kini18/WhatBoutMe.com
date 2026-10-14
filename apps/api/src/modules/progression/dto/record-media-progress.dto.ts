import { IsDefined, IsNumber, Min, IsOptional, IsBoolean } from 'class-validator';

export class RecordMediaProgressDto {
  @IsDefined({ message: 'positionSec is required' })
  @IsNumber(
    { allowNaN: false, allowInfinity: false },
    { message: 'positionSec must be a finite number' },
  )
  @Min(0, { message: 'positionSec must be greater than or equal to 0' })
  positionSec: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  videoDurationSec?: number;

  @IsOptional()
  @IsBoolean()
  isEnded?: boolean;
}

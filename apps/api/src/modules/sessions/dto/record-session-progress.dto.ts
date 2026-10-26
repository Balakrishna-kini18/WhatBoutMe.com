import { IsNumber, IsOptional, IsBoolean, Min } from 'class-validator';

export class RecordSessionProgressDto {
  @IsNumber()
  @Min(0)
  positionSec: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  fromSec?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  toSec?: number;

  @IsOptional()
  @IsBoolean()
  isEnded?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  videoDurationSec?: number;
}

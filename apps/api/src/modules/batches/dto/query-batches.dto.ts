import { IsEnum, IsOptional, IsString } from 'class-validator';
import { BatchStatus } from '@prisma/client';

export class QueryBatchesDto {
  @IsOptional()
  @IsString()
  programId?: string;

  @IsOptional()
  @IsEnum(BatchStatus)
  status?: BatchStatus;
}

import { IsEnum, IsNotEmpty } from 'class-validator';
import { BatchStatus } from '@prisma/client';

export class TransitionBatchStatusDto {
  @IsEnum(BatchStatus)
  @IsNotEmpty()
  status: BatchStatus;
}

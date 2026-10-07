import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class TransferBatchDto {
  @IsUUID()
  @IsNotEmpty()
  destinationBatchId: string;

  @IsString()
  @IsOptional()
  reason?: string;
}

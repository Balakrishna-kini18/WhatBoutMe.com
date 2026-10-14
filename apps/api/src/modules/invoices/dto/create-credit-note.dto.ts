import { IsOptional, IsNumber, IsPositive, IsString } from 'class-validator';

export class CreateCreditNoteDto {
  @IsOptional()
  @IsNumber()
  @IsPositive({ message: 'Credit note amount must be greater than zero' })
  amount?: number;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  refundReference?: string;
}

import { IsOptional, IsUUID } from 'class-validator';

export class QueryAgreementTemplatesDto {
  @IsUUID()
  @IsOptional()
  programId?: string;
}

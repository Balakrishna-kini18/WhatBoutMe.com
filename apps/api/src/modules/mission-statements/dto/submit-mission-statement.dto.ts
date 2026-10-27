import { IsNotEmpty, IsUUID } from 'class-validator';

export class SubmitMissionStatementDto {
  @IsUUID()
  @IsNotEmpty()
  enrolmentId!: string;
}

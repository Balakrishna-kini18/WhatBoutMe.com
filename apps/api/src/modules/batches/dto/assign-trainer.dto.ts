import { IsNotEmpty, IsString } from 'class-validator';

export class AssignTrainerDto {
  @IsString()
  @IsNotEmpty()
  trainerId: string;
}

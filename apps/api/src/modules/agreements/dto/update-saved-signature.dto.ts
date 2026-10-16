import { IsIn, IsNotEmpty, IsString } from 'class-validator';

export class UpdateSavedSignatureDto {
  @IsString()
  @IsNotEmpty({ message: 'Signature data is required' })
  signatureData!: string;

  @IsString()
  @IsIn(['DRAWN', 'UPLOADED'], { message: 'signatureType must be DRAWN or UPLOADED' })
  signatureType!: 'DRAWN' | 'UPLOADED';
}

import { IsString, IsNotEmpty, IsNumber, Min, Max, Matches } from 'class-validator';

export class RequestUploadUrlDto {
  @IsString()
  @IsNotEmpty()
  fileName: string;

  @IsString()
  @IsNotEmpty()
  @Matches(
    /^(application\/pdf|audio\/(mpeg|wav|mp4|x-m4a|ogg|aac)|video\/(mp4|webm|quicktime))$/i,
    {
      message:
        'Only PDF documents, audio files (MP3, WAV, M4A, OGG, AAC), and MP4/WebM videos are supported',
    },
  )
  mimeType: string;

  @IsNumber()
  @Min(1)
  @Max(104857600, { message: 'Maximum file size allowed is 100MB' })
  fileSizeBytes: number;
}

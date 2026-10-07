import { IsString, IsNotEmpty, IsOptional, IsEnum } from 'class-validator';
import { ConversationStatus } from '@prisma/client';

export class CreateConversationDto {
  @IsString()
  @IsNotEmpty()
  batchId: string;

  @IsString()
  @IsNotEmpty()
  initialMessage: string;
}

export class SendMessageDto {
  @IsString()
  @IsNotEmpty()
  content: string;

  @IsString()
  @IsOptional()
  attachmentUrl?: string;
}

export class UpdateConversationStatusDto {
  @IsEnum(ConversationStatus)
  status: ConversationStatus;
}

export interface DirectUploadResult {
  signature: string;
  timestamp: number;
  uploadUrl?: string;
  // Allows for provider-specific fields like cloudName or apiKey
  [key: string]: any;
}

export interface IMediaProvider {
  createDirectUpload(): DirectUploadResult | Promise<DirectUploadResult>;
  generateSignedPlaybackUrl(publicId: string, learnerEmail?: string): string;
  generateSignedThumbnailUrl(publicId: string, offsetSeconds?: number): string;
}

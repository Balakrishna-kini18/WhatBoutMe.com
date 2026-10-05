import { Injectable } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';

@Injectable()
export class CloudinaryMediaProvider {
  constructor() {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
  }

  // D2-002: Configure video upload pipeline to store strictly as 'authenticated'
  createDirectUpload() {
    const timestamp = Math.round(new Date().getTime() / 1000);
    
    // Generate a signature for a direct client-side upload.
    // By enforcing 'type: authenticated' here, the video will not be publicly accessible
    // via a standard Cloudinary URL.
    const signature = cloudinary.utils.api_sign_request(
      {
        timestamp,
        type: 'authenticated',
        resource_type: 'video',
      },
      process.env.CLOUDINARY_API_SECRET || ''
    );

    return {
      signature,
      timestamp,
      cloudName: process.env.CLOUDINARY_CLOUD_NAME,
      apiKey: process.env.CLOUDINARY_API_KEY,
      uploadUrl: `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/video/upload`
    };
  }

  // D2-003, D2-005, D2-006: Implement generateSignedPlaybackUrl with TTL, adaptive bitrate, and watermark
  generateSignedPlaybackUrl(publicId: string, learnerEmail?: string): string {
    // Basic Cloudinary config for signed HLS streaming
    const options: any = {
      resource_type: 'video',
      type: 'authenticated',
      format: 'm3u8',
      streaming_profile: 'auto',
      secure: true,
      sign_url: true,
      auth_token: {
        key: process.env.CLOUDINARY_API_SECRET,
        duration: 300 // 300 seconds TTL
      }
    };

    // D2-006: Apply static watermark if learnerEmail is provided
    if (learnerEmail) {
      options.transformation = [
        {
          overlay: {
            font_family: 'Arial',
            font_size: 20,
            text: encodeURIComponent(learnerEmail),
          },
          gravity: 'south_east',
          x: 20,
          y: 20,
          color: 'white',
          opacity: 40,
        }
      ];
    }

    return cloudinary.url(publicId, options);
  }

  // D2-007: Implement video thumbnail extraction at specified offsets with signed delivery URLs
  generateSignedThumbnailUrl(publicId: string, offsetSeconds: number = 0): string {
    return cloudinary.url(publicId, {
      resource_type: 'video',
      type: 'authenticated',
      format: 'jpg',
      start_offset: offsetSeconds, // Time in seconds for the thumbnail frame
      secure: true,
      sign_url: true, // Generate signature for access since it's an authenticated resource
      auth_token: {
        key: process.env.CLOUDINARY_API_SECRET,
        duration: 3600 // 1 hour TTL for thumbnail caching on frontend
      }
    });
  }
}

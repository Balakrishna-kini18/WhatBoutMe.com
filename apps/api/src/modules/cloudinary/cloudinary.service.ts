import { Injectable } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import { IMediaProvider } from '../../common/interfaces/media-provider.interface.js';

@Injectable()
export class CloudinaryMediaProvider implements IMediaProvider {
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
      sign_url: true
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
      sign_url: true // Generate signature for access since it's an authenticated resource
    });
  }

  // D2-010: Implement exponential backoff and rate-limit handling for Cloudinary API requests
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    baseDelayMs: number = 1000
  ): Promise<T> {
    let attempt = 0;
    while (attempt < maxRetries) {
      try {
        return await operation();
      } catch (error: any) {
        // Cloudinary API throws errors with http_code for rate limiting (420 or 429)
        const isRateLimit = error?.http_code === 420 || error?.http_code === 429;
        
        if (!isRateLimit || attempt === maxRetries - 1) {
          throw error;
        }

        const delay = baseDelayMs * Math.pow(2, attempt);
        console.warn(`Cloudinary rate limit hit. Retrying in ${delay}ms... (Attempt ${attempt + 1} of ${maxRetries})`);
        
        await new Promise((resolve) => setTimeout(resolve, delay));
        attempt++;
      }
    }
    throw new Error('Cloudinary operation failed after maximum retries');
  }
  async deleteMedia(publicId: string, resourceType: string = 'video'): Promise<boolean> {
    return this.executeWithRetry(async () => {
      // For videos, try authenticated first because video uploads in WhatBoutMe are authenticated
      if (resourceType === 'video') {
        const authRes = await cloudinary.uploader.destroy(publicId, { resource_type: 'video', type: 'authenticated' }).catch(() => null);
        if (authRes?.result === 'ok') return true;
      }
      const result = await cloudinary.uploader.destroy(publicId, { resource_type: resourceType }).catch(() => null);
      return result?.result === 'ok' || result?.result === 'not found';
    });
  }
}

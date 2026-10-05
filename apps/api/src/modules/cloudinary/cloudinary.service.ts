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
}

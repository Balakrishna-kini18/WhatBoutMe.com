import { Injectable } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import { IObjectStorageProvider } from '../../common/interfaces/object-storage-provider.interface.js';
import { PassThrough } from 'stream';

@Injectable()
export class CloudinaryObjectStorageProvider implements IObjectStorageProvider {
  constructor() {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
  }

  private getResourceTypeFromKey(key: string): 'image' | 'video' | 'raw' {
    if (key.match(/\.(mp4|mov|avi|wmv|mkv|webm|m3u8|ts|mp3|wav|ogg)$/i)) return 'video';
    if (key.match(/\.(jpg|jpeg|png|gif|webp|svg|bmp|tiff)$/i)) return 'image';
    return 'raw'; // Used for PDFs, documents, JSON, CSVs, etc.
  }

  // D2-014: Implement getPresignedGetUrl
  async getPresignedGetUrl(key: string, expiresInSeconds: number = 60): Promise<string> {
    const resourceType = this.getResourceTypeFromKey(key);
    return cloudinary.url(key, {
      resource_type: resourceType,
      type: 'authenticated',
      secure: true,
      sign_url: true
    });
  }

  // D2-015: Implement getPresignedPutUrl
  async getPresignedPutUrl(key: string, contentType: string, expiresInSeconds: number = 300): Promise<string> {
    const timestamp = Math.round(Date.now() / 1000);
    const resourceType = this.getResourceTypeFromKey(key);
    
    const signature = cloudinary.utils.api_sign_request({
      timestamp,
      public_id: key,
      type: 'authenticated',
    }, process.env.CLOUDINARY_API_SECRET || '');

    // Return a URL that acts as the upload endpoint with all required signature params
    return `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/${resourceType}/upload?api_key=${process.env.CLOUDINARY_API_KEY}&timestamp=${timestamp}&signature=${signature}&public_id=${key}&type=authenticated`;
  }

  // D2-016: Implement uploadBuffer
  async uploadBuffer(key: string, buffer: Buffer, contentType: string): Promise<string> {
    const resourceType = this.getResourceTypeFromKey(key);
    
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          public_id: key,
          resource_type: resourceType,
          type: 'authenticated',
          // Optionally hint Cloudinary on the format if it's raw
        },
        (error, result) => {
          if (error) return reject(error);
          resolve(result!.public_id);
        }
      );
      
      const bufferStream = new PassThrough();
      bufferStream.end(buffer);
      bufferStream.pipe(uploadStream);
    });
  }

  async deleteObject(key: string): Promise<void> {
    const resourceType = this.getResourceTypeFromKey(key);
    await cloudinary.uploader.destroy(key, { 
      resource_type: resourceType, 
      type: 'authenticated' 
    });
  }

  async objectExists(key: string): Promise<boolean> {
    const resourceType = this.getResourceTypeFromKey(key);
    try {
      await cloudinary.api.resource(key, { 
        resource_type: resourceType, 
        type: 'authenticated' 
      });
      return true;
    } catch (e: any) {
      if (e.http_code === 404) return false;
      throw e;
    }
  }
}

export interface IObjectStorageProvider {
  getPresignedGetUrl(key: string, expiresInSeconds?: number): Promise<string>;
  getPresignedPutUrl(key: string, contentType: string, expiresInSeconds?: number): Promise<string>;
  uploadBuffer(key: string, buffer: Buffer, contentType: string): Promise<string>;
  deleteObject(key: string): Promise<void>;
  objectExists(key: string): Promise<boolean>;
}

export const OBJECT_STORAGE_PROVIDER = 'OBJECT_STORAGE_PROVIDER';

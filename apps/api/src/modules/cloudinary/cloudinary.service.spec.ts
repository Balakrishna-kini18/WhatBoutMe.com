import { Test, TestingModule } from '@nestjs/testing';
import { CloudinaryMediaProvider } from './cloudinary.service.js';

describe('CloudinaryMediaProvider', () => {
  let service: CloudinaryMediaProvider;

  beforeAll(() => {
    // Set dummy environment variables for testing so we don't leak real secrets
    process.env.CLOUDINARY_CLOUD_NAME = 'test_cloud';
    process.env.CLOUDINARY_API_KEY = 'test_key';
    process.env.CLOUDINARY_API_SECRET = 'test_secret_that_is_long_enough';
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CloudinaryMediaProvider],
    }).compile();

    service = module.get<CloudinaryMediaProvider>(CloudinaryMediaProvider);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createDirectUpload', () => {
    it('should generate a signature for authenticated video upload', () => {
      const result = service.createDirectUpload();
      
      expect(result).toHaveProperty('signature');
      expect(result).toHaveProperty('timestamp');
      expect(result.cloudName).toBe('test_cloud');
      expect(result.apiKey).toBe('test_key');
      expect(result.uploadUrl).toContain('test_cloud/video/upload');
      
      // The signature must be a non-empty string
      expect(typeof result.signature).toBe('string');
      expect(result.signature.length).toBeGreaterThan(0);
    });
  });

  describe('generateSignedPlaybackUrl', () => {
    it('should generate an HLS m3u8 URL with a signature and TTL', () => {
      const publicId = 'test_video_id';
      const url = service.generateSignedPlaybackUrl(publicId);

      // Verify the format is m3u8 (adaptive bitrate)
      expect(url).toContain('.m3u8');
      
      // Verify signature query parameter is present (__cld_token__=)
      expect(url).toContain('__cld_token__=');
      
      // Verify adaptive bitrate profile is auto
      expect(url).toContain('sp_auto');
      
      // Verify it is served securely
      expect(url.startsWith('https://')).toBeTruthy();
    });

    it('should include the learner email watermark if provided', () => {
      const publicId = 'test_video_id';
      const email = 'learner@example.com';
      const url = service.generateSignedPlaybackUrl(publicId, email);

      // Verify text overlay transformation is included
      // encodeURIComponent('learner@example.com') is 'learner%40example.com'
      expect(url).toContain('l_text:Arial_20:learner%2540example.com');
      // Verify gravity south_east (g_south_east)
      expect(url).toContain('g_south_east');
    });
  });

  describe('generateSignedThumbnailUrl', () => {
    it('should generate a JPG URL at a specific offset with a signature', () => {
      const publicId = 'test_video_id';
      const url = service.generateSignedThumbnailUrl(publicId, 15);

      // Verify the format is jpg
      expect(url).toContain('.jpg');
      
      // Verify signature query parameter is present
      expect(url).toContain('__cld_token__=');
      
      // Verify the start_offset transformation is present (so_15)
      expect(url).toContain('so_15');
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { CloudinaryWebhookController } from './cloudinary.webhook.controller.js';
import { HttpException, HttpStatus } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';

describe('CloudinaryWebhookController', () => {
  let controller: CloudinaryWebhookController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CloudinaryWebhookController],
    }).compile();

    controller = module.get<CloudinaryWebhookController>(CloudinaryWebhookController);
    
    // Mock cloudinary verification
    vi.spyOn(cloudinary.utils, 'verifyNotificationSignature').mockReturnValue(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('handleCloudinaryWebhook (D2-009)', () => {
    it('should throw UNAUTHORIZED if signature or timestamp is completely missing', async () => {
      const mockReq: any = { body: {}, rawBody: Buffer.from('{}') };
      
      await expect(controller.handleCloudinaryWebhook(mockReq, '', '1234567890'))
        .rejects.toThrow(new HttpException('Missing signature or timestamp', HttpStatus.UNAUTHORIZED));
        
      await expect(controller.handleCloudinaryWebhook(mockReq, 'valid-sig', ''))
        .rejects.toThrow(new HttpException('Missing signature or timestamp', HttpStatus.UNAUTHORIZED));
    });

    it('should use rawBody exactly as-is for signature verification (Production Edge Case)', async () => {
      const mockRawBodyString = '{"some_key":    "spaced_out_value"  }'; // Intentionally malformed spacing
      const mockReq: any = { 
        body: { some_key: 'spaced_out_value' }, 
        rawBody: Buffer.from(mockRawBodyString) 
      };
      
      const sig = 'valid-sig';
      const ts = '1234567890';
      
      const result = await controller.handleCloudinaryWebhook(mockReq, sig, ts);
      
      // Verification should have been called with the EXACT RAW STRING, not the parsed JSON
      expect(cloudinary.utils.verifyNotificationSignature).toHaveBeenCalledWith(
        mockRawBodyString,
        1234567890,
        sig,
        7200
      );
      expect(result).toEqual({ received: true });
    });

    it('should fallback to stringified body if rawBody is missing (e.g. testing environments)', async () => {
      const mockReq: any = { 
        body: { type: 'upload' }, 
        // rawBody is intentionally missing
      };
      
      await controller.handleCloudinaryWebhook(mockReq, 'sig', '1234567890');
      
      expect(cloudinary.utils.verifyNotificationSignature).toHaveBeenCalledWith(
        '{"type":"upload"}', // Fallback JSON.stringify
        1234567890,
        'sig',
        7200
      );
    });

    it('should throw UNAUTHORIZED if cloudinary rejects the signature (Attack Edge Case)', async () => {
      vi.spyOn(cloudinary.utils, 'verifyNotificationSignature').mockReturnValue(false); // Rejected!
      
      const mockReq: any = { body: {}, rawBody: Buffer.from('{}') };
      
      await expect(controller.handleCloudinaryWebhook(mockReq, 'fake-sig', '1234567890'))
        .rejects.toThrow(new HttpException('Invalid webhook signature', HttpStatus.UNAUTHORIZED));
    });
  });
});

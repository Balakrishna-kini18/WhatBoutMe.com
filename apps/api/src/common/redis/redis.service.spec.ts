import { Test, TestingModule } from '@nestjs/testing';
import { RedisService } from './redis.service.js';
import { Redis } from 'ioredis';

vi.mock('ioredis', () => {
  const RedisMock = vi.fn();
  RedisMock.prototype.on = vi.fn();
  RedisMock.prototype.get = vi.fn();
  RedisMock.prototype.set = vi.fn();
  RedisMock.prototype.del = vi.fn();
  RedisMock.prototype.quit = vi.fn();
  return { Redis: RedisMock, default: RedisMock };
});

describe('RedisService', () => {
  let service: RedisService;
  let redisClientMock: any;

  beforeEach(async () => {
    // Isolate env vars
    const originalEnv = process.env;
    process.env = { ...originalEnv, REDIS_HOST: 'localhost', REDIS_PORT: '6379' };

    const module: TestingModule = await Test.createTestingModule({
      providers: [RedisService],
    }).compile();

    service = module.get<RedisService>(RedisService);
    redisClientMock = service.getClient();
    process.env = originalEnv;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Connection & Setup (Edge Cases)', () => {
    it('should connect using REDIS_URL with TLS if it starts with rediss://', () => {
      const originalEnv = process.env;
      process.env = { ...originalEnv, REDIS_URL: 'rediss://user:pass@cloud.upstash.io:6379' };
      
      const newService = new RedisService();
      
      expect(Redis).toHaveBeenCalledWith(
        'rediss://user:pass@cloud.upstash.io:6379',
        expect.objectContaining({
          tls: { rejectUnauthorized: false },
          maxRetriesPerRequest: null
        })
      );
      
      process.env = originalEnv;
    });

    it('should connect without TLS if REDIS_URL is a standard redis://', () => {
      const originalEnv = process.env;
      process.env = { ...originalEnv, REDIS_URL: 'redis://localhost:6379' };
      
      const newService = new RedisService();
      
      expect(Redis).toHaveBeenCalledWith(
        'redis://localhost:6379',
        expect.objectContaining({
          tls: undefined,
          maxRetriesPerRequest: null
        })
      );
      
      process.env = originalEnv;
    });
  });

  describe('Key-Value Operations', () => {
    it('should gracefully handle setting values with a TTL (e.g. Idempotency Locks)', async () => {
      await service.set('test-key', 'value', 60);
      expect(redisClientMock.set).toHaveBeenCalledWith('test-key', 'value', 'EX', 60);
    });

    it('should handle setting values without a TTL', async () => {
      await service.set('perm-key', 'value');
      expect(redisClientMock.set).toHaveBeenCalledWith('perm-key', 'value');
    });

    it('should safely return null for missing keys during get()', async () => {
      redisClientMock.get.mockResolvedValue(null);
      const result = await service.get('missing-key');
      expect(result).toBeNull();
      expect(redisClientMock.get).toHaveBeenCalledWith('missing-key');
    });

    it('should properly delegate delete requests', async () => {
      await service.del('dirty-key');
      expect(redisClientMock.del).toHaveBeenCalledWith('dirty-key');
    });
  });
});

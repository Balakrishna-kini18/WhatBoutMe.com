import { Global, Module } from '@nestjs/common';
import { CacheHelperService } from './cache-helper.service.js';

@Global()
@Module({
  providers: [CacheHelperService],
  exports: [CacheHelperService],
})
export class CacheHelperModule {}

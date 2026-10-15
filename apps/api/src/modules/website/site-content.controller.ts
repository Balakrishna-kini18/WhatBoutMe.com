import { BadRequestException, Body, Controller, Get, Optional, Put } from '@nestjs/common';
import { Role } from '@prisma/client';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { Public } from '../../common/decorators/public.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { PublicCache } from '../../common/decorators/cache-control.decorator.js';
import { CacheHelperService } from '../../common/cache/cache-helper.service.js';
import { SITE_CONTENT_FILE } from './storage.js';

/**
 * Editable content of the public website (hero, FAQ, testimonials, contact,
 * images). Accessible via both /site-content and /website.
 */
@Controller(['site-content', 'website'])
export class SiteContentController {
  constructor(
    @Optional()
    private readonly cacheHelper?: CacheHelperService,
  ) {}

  @Public()
  @PublicCache(60, 300)
  @Get()
  async read() {
    const fetcher = async () => {
      try {
        return JSON.parse(await readFile(SITE_CONTENT_FILE, 'utf8'));
      } catch {
        return {};
      }
    };

    if (!this.cacheHelper) {
      return fetcher();
    }

    return this.cacheHelper.getOrSet(
      'public:website:content',
      fetcher,
      3600,
      ['website']
    );
  }

  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @Put()
  async write(@Body() body: Record<string, unknown>) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestException('Website content must be a JSON object');
    }
    // write to a temporary file first so a crash cannot leave half a document
    const temporary = `${SITE_CONTENT_FILE}.tmp`;
    await writeFile(temporary, JSON.stringify(body, null, 2));
    await rename(temporary, SITE_CONTENT_FILE);

    // Invalidate website cache across memory and edge
    if (this.cacheHelper) {
      await this.cacheHelper.invalidateTag('website');
    }

    return body;
  }
}

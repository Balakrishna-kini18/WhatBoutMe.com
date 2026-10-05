import { BadRequestException, Body, Controller, Get, Put } from '@nestjs/common';
import { Role } from '@prisma/client';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { Public } from '../../common/decorators/public.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { SITE_CONTENT_FILE } from './storage.js';

/**
 * Editable content of the public website (hero, FAQ, testimonials, contact,
 * images). Stored as one JSON document; the website fills anything missing
 * from its built-in defaults, so an empty document is valid.
 */
@Controller('site-content')
export class SiteContentController {
  @Public()
  @Get()
  async read() {
    try {
      return JSON.parse(await readFile(SITE_CONTENT_FILE, 'utf8'));
    } catch {
      return {};
    }
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
    return body;
  }
}

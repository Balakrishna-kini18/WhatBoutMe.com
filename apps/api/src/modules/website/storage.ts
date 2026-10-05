import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Files the API keeps on its own disk: uploaded images/PDFs and the website
 * content document. Point STORAGE_DIR at a persistent volume in production;
 * a serverless host does not keep local files between requests.
 */
export const STORAGE_DIR = process.env.STORAGE_DIR || join(process.cwd(), 'storage');
export const UPLOAD_DIR = join(STORAGE_DIR, 'uploads');
export const SITE_CONTENT_FILE = join(STORAGE_DIR, 'site-content.json');

mkdirSync(UPLOAD_DIR, { recursive: true });

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/**
 * Files the API keeps on its own disk: uploaded images/PDFs and the website
 * content document. Point STORAGE_DIR at a persistent volume in production;
 * a serverless host does not keep local files between requests.
 */
const isServerless = Boolean(
  process.env.VERCEL ||
  process.env.AWS_LAMBDA_FUNCTION_NAME ||
  process.env.LAMBDA_TASK_ROOT
);

export const STORAGE_DIR =
  process.env.STORAGE_DIR ||
  (isServerless ? join(tmpdir(), 'storage') : join(process.cwd(), 'storage'));
export const UPLOAD_DIR = join(STORAGE_DIR, 'uploads');
export const SITE_CONTENT_FILE = join(STORAGE_DIR, 'site-content.json');

try {
  mkdirSync(UPLOAD_DIR, { recursive: true });
} catch (err: any) {
  console.warn('[storage] mkdirSync warning (safe to ignore on serverless):', err?.message || err);
}


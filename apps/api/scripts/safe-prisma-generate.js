import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

try {
  execSync('npx prisma generate', { stdio: 'inherit' });
} catch (error) {
  // If the query engine binary is locked by a running process on Windows
  // (e.g., an active dev server), but the client was already generated,
  // allow the build to proceed instead of failing with EPERM.
  const clientPath = resolve('../../node_modules/@prisma/client');
  const localClientPath = resolve('node_modules/@prisma/client');
  const clientExists = existsSync(clientPath) || existsSync(localClientPath);

  if (process.platform === 'win32' && clientExists) {
    console.warn('\n⚠️ [prisma] query_engine-windows.dll.node is locked by an active process.');
    console.warn('ℹ️ Existing Prisma Client found. Continuing build...\n');
  } else {
    throw error;
  }
}

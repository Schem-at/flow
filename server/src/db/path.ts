import { accessSync, constants, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';

/**
 * The SQLite file must live somewhere writable. The tools executor runs with a
 * read-only root filesystem (only /tmp is a tmpfs), where the image's default
 * /app/server/data is not writable: fall back to the tmp dir instead of
 * crashing at boot.
 */
export function resolveDatabasePath(requested: string, fallbackDir: string = tmpdir()): string {
  const dir = dirname(requested);
  try {
    mkdirSync(dir, { recursive: true });
    accessSync(dir, constants.W_OK);
    return requested;
  } catch (error) {
    const fallback = join(fallbackDir, basename(requested));
    console.warn(`Database directory ${dir} is not writable (${(error as NodeJS.ErrnoException).code}); using ${fallback}.`);
    return fallback;
  }
}

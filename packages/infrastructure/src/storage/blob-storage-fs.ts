import { promises as fs, createReadStream } from 'node:fs';
import { join, dirname } from 'node:path';
import { Readable } from 'node:stream';
import type { BlobStorageAdapter } from '../adapter-ports';

export function createFilesystemBlobStorage(baseDir: string = process.env.BLOB_FS_DIR ?? './.blobs'): BlobStorageAdapter {
  return {
    async put(key, body) {
      const path = join(baseDir, key);
      await fs.mkdir(dirname(path), { recursive: true });
      await fs.writeFile(path, body);
    },
    async get(key) {
      return fs.readFile(join(baseDir, key));
    },
    async stream(key) {
      const path = join(baseDir, key);
      const nodeStream = createReadStream(path);
      return Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
    },
    async delete(key) {
      await fs.unlink(join(baseDir, key)).catch(() => {});
    },
    // signedUrl is intentionally omitted — filesystem storage
    // doesn't support time-limited URLs. Callers should check
    // for its existence before using it (see blob/route.ts).
  };
}

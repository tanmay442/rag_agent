// pg bytea ↔ Buffer customType. The hand-rolled equivalent
// used to live inline in src/lib/db/schema.ts; the magic
// path through the new pg-driver required a separate file
// for type reasons. Kept here so the schema module reads
// cleanly.
import { customType } from 'drizzle-orm/pg-core';

export const byteaBlob = customType<{ data: Buffer | null; driverData: Buffer | null }>({
  dataType() {
    return 'bytea';
  },
  toDriver(value: Buffer | null): Buffer | null {
    return value;
  },
  fromDriver(value: unknown): Buffer | null {
    if (value == null) return null;
    if (Buffer.isBuffer(value)) return value;
    if (value instanceof ArrayBuffer || value instanceof SharedArrayBuffer) {
      return Buffer.from(value);
    }
    throw new Error(`Unexpected value type from driver: ${typeof value}`);
  },
});

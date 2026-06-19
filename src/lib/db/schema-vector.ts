import { customType } from 'drizzle-orm/pg-core';

// pgvector type. Used for 768-dim embeddings from Google's text-embedding-004.
// Driver values are the raw pgvector string format ('[0.1,0.2,...]'); the
// application code converts to/from `number[]` at the boundary.
export const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return 'vector(768)';
  },
  toDriver(value: number[]): string {
    return `[${value.join(',')}]`;
  },
  fromDriver(value: string): number[] {
    if (typeof value === 'string') {
      return value
        .slice(1, -1)
        .split(',')
        .map((n) => Number(n));
    }
    return value as unknown as number[];
  },
});

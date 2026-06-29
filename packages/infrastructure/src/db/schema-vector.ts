import { customType } from 'drizzle-orm/pg-core';

const VECTOR_DIM = parseInt(process.env.EMBEDDING_DIMENSION || '768', 10);

export const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return `vector(${VECTOR_DIM})`;
  },
  toDriver(value: number[]): string {
    return `[${value.join(',')}]`;
  },
  fromDriver(value: unknown): number[] {
    if (typeof value === 'string') {
      return value.replace(/^\[/, '').replace(/\]$/, '').split(',').map((s) => Number(s));
    }
    if (Array.isArray(value) && value.every((v) => typeof v === 'number')) {
      return value;
    }
    throw new Error(`Unexpected vector value from driver: ${typeof value}`);
  },
});

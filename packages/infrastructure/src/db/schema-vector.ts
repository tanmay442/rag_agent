import { customType } from 'drizzle-orm/pg-core';

let _vectorDim: number | null = null;

function getVectorDim(): number {
  if (_vectorDim !== null) return _vectorDim;
  const parsedDim = parseInt(process.env.EMBEDDING_DIMENSION || '768', 10);
  if (!Number.isFinite(parsedDim) || parsedDim <= 0) {
    throw new Error(
      `Invalid EMBEDDING_DIMENSION: "${process.env.EMBEDDING_DIMENSION}". ` +
        'Expected a positive integer (default 768).',
    );
  }
  _vectorDim = parsedDim;
  return _vectorDim;
}

export const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return `vector(${getVectorDim()})`;
  },
  toDriver(value: number[]): string {
    return `[${value.join(',')}]`;
  },
  fromDriver(value: unknown): number[] {
    if (typeof value === 'string') {
      return value
        .replace(/^\[/, '')
        .replace(/\]$/, '')
        .split(',')
        .map((s) => Number(s.trim()));
    }
    if (Array.isArray(value) && value.every((v) => typeof v === 'number')) {
      return value;
    }
    throw new Error(`Unexpected vector value from driver: ${typeof value}`);
  },
});

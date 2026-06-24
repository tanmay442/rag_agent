import { customType } from 'drizzle-orm/pg-core';

let activeDimension = 768;

export function setVectorDimension(dim: number) {
  activeDimension = dim;
}

export function getVectorDimension(): number {
  return activeDimension;
}

export function createVectorType(dimension: number) {
  return customType<{ data: number[]; driverData: string }>({
    dataType() {
      return `vector(${dimension})`;
    },
    toDriver(value: number[]): string {
      return `[${value.join(',')}]`;
    },
    fromDriver(value: unknown): number[] {
      if (typeof value === 'string') {
        return value.replace(/^\[/, '').replace(/\]$/, '').split(',').map((s) => Number(s));
      }
      return value as number[];
    },
  });
}

export const vector = createVectorType(768);

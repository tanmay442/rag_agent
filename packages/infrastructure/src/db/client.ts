// Drizzle ORM client. Owns the pg Pool construction; the db
// object is the single export everything else in the package
// uses. Pool + env loading live in `./pool.ts` to keep this
// file focused on the drizzle wiring.
import { drizzle } from 'drizzle-orm/node-postgres';
import { buildPool } from './pool';
import * as schema from './schema';

export { schema };
export const db = drizzle(buildPool(), { schema });
export type DB = typeof db;

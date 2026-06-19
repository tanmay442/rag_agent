import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
const { Pool } = pg;

const dir = './drizzle';
const files = readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
console.log(`applying ${files.length} migration(s)...`);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// Custom alter statements to add the new columns to the existing
// pre-migration tables. Drizzle-kit's initial migration file only
// contains CREATE TABLE; the new columns on existing tables need
// to be added here.
const addColumns = [
  'ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "blob" "bytea";',
  'ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp;',
  'ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "assigned_to" text;',
  'ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "notes" text;',
];

for (const sql of addColumns) {
  console.log('-- add column:', sql);
  try {
    await pool.query(sql);
    console.log('  ok');
  } catch (err) {
    console.log('  ERROR:', err.message);
  }
}

for (const file of files) {
  const sql = readFileSync(join(dir, file), 'utf8');
  const statements = sql.split(/-->\s*statement-breakpoint/).map(s => s.trim()).filter(Boolean);
  console.log(`-- ${file}: ${statements.length} statements`);
  for (const stmt of statements) {
    try {
      await pool.query(stmt);
    } catch (err) {
      const msg = err.message || '';
      if (
        err.code === '42710' || // duplicate object
        err.code === '42P07' || // duplicate table
        err.code === '42701' || // duplicate column
        err.code === '42P06' || // duplicate schema
        err.code === '42P10' || // duplicate object
        msg.includes('already exists') ||
        msg.includes('does not exist')
      ) {
        console.log('  skip:', msg.split('\n')[0]);
      } else {
        console.log('  ERROR:', msg.split('\n')[0]);
        throw err;
      }
    }
  }
}
await pool.end();
console.log('done');

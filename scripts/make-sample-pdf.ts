// Thin shim — see packages/pulsar-content/src/school/student-handbook.ts.
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeStudentHandbook } from '../packages/pulsar-content/src/school/student-handbook.js';

const HERE = dirname(fileURLToPath(import.meta.url));

export { buildPdf, writeStudentHandbook } from '../packages/pulsar-content/src/school/student-handbook.js';

export function writeSamplePdf(outPath: string = join(HERE, 'fixtures', 'sample.pdf')): string {
  return writeStudentHandbook(outPath);
}

const invokedDirectly = (() => {
  try {
    return import.meta.url === `file://${process.argv[1]}`;
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  const out = writeSamplePdf();
  console.log(`Wrote ${out}`);
}

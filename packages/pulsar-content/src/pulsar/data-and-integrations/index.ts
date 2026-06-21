// Re-export the lines for the data-and-integrations fixture, plus a
// render-to-disk helper that drops the file into `outDir`. The
// default `outDir` is `./documents` so `pnpm seed` picks the
// file up without extra configuration.
import { renderPdf } from '../../render-pdf.js';
import { lines } from './lines.js';

export { lines };
export const fileName = '07-data-and-integrations.pdf';

export async function write(outDir: string): Promise<string> {
  const trimmed = outDir.replace(/\/$/, '');
  const outPath = `${trimmed}/${fileName}`;
  await renderPdf({ outPath, lines });
  return outPath;
}

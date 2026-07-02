// pdf-parse adapter. The library's index.js has a debug
// branch that tries to read a bundled test PDF
// (`./test/data/05-versions-space.pdf`) at module-eval time
// when `!module.parent`. Vercel's Turbopack runtime doesn't
// always preserve `module.parent` the way Node does, so that
// branch fires during the build's page-data collection and
// crashes the deploy. The implementation lives in
// `lib/pdf-parse.js`; importing the lib entry directly
// bypasses the debug branch.
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import type { PdfParser } from '@app/domain';

export const pdfParseParser: PdfParser = {
  async extractText(buffer: Buffer): Promise<string> {
    const result = await pdfParse(buffer);
    return result.text;
  },
};

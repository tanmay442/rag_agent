// Shared pdf-lib helper used by every fixture in this package.
// Produces a one-page PDF whose only text is the lines passed in,
// using the standard Helvetica font. The y-axis is reset to 750
// on entry and decremented by 20 per line; if we run off the
// bottom of the page we stop drawing (acceptable for the
// reference content we ship, which fits in < 1 page).
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { writeFileSync } from 'node:fs';

export interface RenderOptions {
  outPath: string;
  lines: readonly string[];
  fontSize?: number;
  startY?: number;
  lineHeight?: number;
}

export async function renderPdf(opts: RenderOptions): Promise<void> {
  const fontSize = opts.fontSize ?? 12;
  const startY = opts.startY ?? 750;
  const lineHeight = opts.lineHeight ?? 20;
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([612, 792]);
  let y = startY;
  for (const line of opts.lines) {
    if (y < 50) break;
    page.drawText(line, { x: 50, y, size: fontSize, font, color: rgb(0, 0, 0) });
    y -= lineHeight;
  }
  const bytes = await doc.save({ useObjectStreams: false });
  writeFileSync(opts.outPath, bytes);
}

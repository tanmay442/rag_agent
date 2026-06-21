import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildPdf, writeStudentHandbook } from '../school/student-handbook';

// We don't run `pdf-parse` in this test. It works fine in pure
// Node but blows up in jsdom (the test environment) because
// pdfjs-dist needs a `PDFJS.workerSrc` set. Real end-to-end
// parsing is covered by `src/lib/rag/ingest.test.ts` which runs
// in Node. Here we assert the PDF byte structure the hand-rolled
// writer is responsible for.

describe('buildPdf', () => {
  it('produces a valid PDF header and xref trailer', () => {
    const pdf = buildPdf('BT /F1 12 Tf (hello) Tj ET');
    expect(pdf.startsWith('%PDF-1.4')).toBe(true);
    expect(pdf).toMatch(/^xref\n0 \d+\n0000000000 65535 f/m);
    expect(pdf).toMatch(/trailer << .*\/Root 1 0 R >>/);
    expect(pdf).toMatch(/%%EOF\n?$/);
  });

  it('embeds the content stream verbatim with correct Length', () => {
    const content = 'BT /F1 12 Tf (hello world) Tj ET';
    const pdf = buildPdf(content);
    // Stream object includes its declared length.
    expect(pdf).toContain(`<< /Length ${content.length} >>`);
    expect(pdf).toContain(`stream\n${content}\nendstream`);
  });

  it('writes a file the ingestion pipeline can ingest', () => {
    const out = mkdtempSync(join(tmpdir(), 'pdf-test-'));
    try {
      const path = join(out, 'hello.pdf');
      writeStudentHandbook(path);
      const bytes = readFileSync(path);
      // Magic header.
      expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
      // Required trailer.
      expect(bytes.toString('latin1')).toContain('%%EOF');
      // Should be a non-trivial file (a real PDF, not just the
      // 10-byte header).
      expect(bytes.length).toBeGreaterThan(1000);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  it('produces output that starts with the expected %PDF-1.4 header', () => {
    const pdf = buildPdf('BT (a) Tj ET');
    const firstLine = pdf.split('\n', 1)[0];
    expect(firstLine).toBe('%PDF-1.4');
  });
});

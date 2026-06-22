// Shared factory for the Pulsar fixture modules. Each fixture
// (getting-started, admin-guide, etc.) re-exports its `lines`
// and a `write(outDir)` helper that renders them to a PDF. This
// factory eliminates the 7-line write() duplication that was
// present in every fixture's index.ts.
import { renderPdf } from './render-pdf';

export function createPulsarFixture(fileName: string, lines: readonly string[]) {
  return {
    fileName,
    lines,
    write: async (outDir: string): Promise<string> => {
      const trimmed = outDir.replace(/\/$/, '');
      const outPath = `${trimmed}/${fileName}`;
      await renderPdf({ outPath, lines });
      return outPath;
    },
  };
}

import { extractText, getDocumentProxy } from 'unpdf';
import type { ParsedDocument, PdfParser } from '@app/domain';

export const unpdfParser: PdfParser = {
  async extractText(buffer: Buffer): Promise<string> {
    const pdf = await getDocumentProxy(new Uint8Array(buffer), { useSystemFonts: true });
    const { text } = await extractText(pdf, { mergePages: true });
    return text;
  },
  async extractDocument(buffer: Buffer): Promise<ParsedDocument> {
    const pdf = await getDocumentProxy(new Uint8Array(buffer), { useSystemFonts: true });
    const { text: pageTexts, totalPages } = await extractText(pdf, { mergePages: false });
    const pages = pageTexts?.length === totalPages
      ? pageTexts
      : Array.from({ length: totalPages }, (_, i) => pageTexts?.[i] ?? '');
    return {
      text: pages.join('\n\n'),
      pages: pages.map((p, i) => ({ page: i + 1, text: p })),
    };
  },
};

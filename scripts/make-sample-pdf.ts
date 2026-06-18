// Tiny one-off helper to produce a minimal but valid PDF that
// pdf-parse can extract text from. We hand-roll the PDF here so the
// repo doesn't depend on a third-party tool at install time.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

// pdf-parse is happy with very small, text-only PDFs.
const content = `BT
/F1 12 Tf
50 750 Td
(Acme Corp Employee Handbook) Tj
0 -20 Td
(Chapter 1: Dental Plan) Tj
0 -20 Td
(All full-time employees are eligible for the dental plan, which covers) Tj
0 -20 Td
(two cleanings per calendar year at no cost. Orthodontic work is) Tj
0 -20 Td
(covered at 50 percent after a 12 month waiting period.) Tj
0 -40 Td
(Chapter 2: Submitting Claims) Tj
0 -20 Td
(Claims can be submitted via the HR portal at https://hr.example.com.) Tj
0 -20 Td
(Please allow 7-10 business days for reimbursement.) Tj
ET`;

const objects: string[] = [];
// 1. Catalog
objects.push('<< /Type /Catalog /Pages 2 0 R >>');
// 2. Pages
objects.push('<< /Type /Pages /Count 1 /Kids [3 0 R] >>');
// 3. Page
objects.push(
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
);
// 4. Content stream
const stream = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
objects.push(stream);
// 5. Font
objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

let pdf = '%PDF-1.4\n';
const offsets: number[] = [];
for (let i = 0; i < objects.length; i++) {
  offsets.push(pdf.length);
  pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
}
const xrefStart = pdf.length;
pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
for (const off of offsets) {
  pdf += `${off.toString().padStart(10, '0')} 00000 n \n`;
}
pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

const out = join(HERE, 'fixtures', 'sample.pdf');
writeFileSync(out, pdf, 'utf8');
console.log(`Wrote ${out} (${pdf.length} bytes)`);

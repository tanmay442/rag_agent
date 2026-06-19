// Tiny one-off helper to produce a minimal but valid PDF that
// pdf-parse can extract text from. We hand-roll the PDF here so the
// repo doesn't depend on a third-party tool at install time.
//
// Run with: pnpm tsx scripts/make-sample-pdf.ts
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

const PAGE_CONTENT = `BT
/F1 12 Tf
50 750 Td
(Gardenia Public School - Student & Parent Handbook) Tj
0 -20 Td
(Academic Year 2025-2026) Tj
0 -20 Td
(Maintained by the Office of the Principal) Tj
0 -40 Td
(Chapter 1: School Hours and Attendance) Tj
0 -20 Td
(School hours are 8:00 AM to 3:30 PM, Monday through Friday.) Tj
0 -20 Td
(Office hours are 7:30 AM to 4:30 PM. The front gate closes at 8:15) Tj
0 -20 Td
(AM; late arrivals must report to the main office for a tardy slip.) Tj
0 -20 Td
(Students are expected to maintain a minimum of 95 percent attendance.) Tj
0 -20 Td
(Absences must be reported by a parent or guardian before 9:00 AM on) Tj
0 -20 Td
(the day of the absence, either through the parent portal or by phone.) Tj
0 -40 Td
(Chapter 2: Uniform Policy) Tj
0 -20 Td
(The school uniform is mandatory for all students in grades 1 through 12.) Tj
0 -20 Td
(Boys: navy blue trousers, white shirt, school tie, and black shoes.) Tj
0 -20 Td
(Girls: navy blue pinafore or trousers, white blouse, school tie, and) Tj
0 -20 Td
(black shoes. Hair accessories must be in school colors: navy, white,) Tj
0 -20 Td
(or maroon. Physical education days: house-color T-shirt and white shorts.) Tj
0 -40 Td
(Chapter 3: Examinations and Report Cards) Tj
0 -20 Td
(Term exams are held in September, December, March, and June.) Tj
0 -20 Td
(Report cards are issued within two weeks of the close of each term.) Tj
0 -20 Td
(Parent-teacher conferences are scheduled on the Saturday following) Tj
0 -20 Td
(report card distribution. Minimum pass mark is 40 percent in each) Tj
0 -20 Td
(subject. A student who fails more than two subjects is required to) Tj
0 -20 Td
(appear for the supplementary examination in July.) Tj
0 -40 Td
(Chapter 4: School Fees and Payment) Tj
0 -20 Td
(Tuition fees for the academic year 2025-2026 are INR 48,000 for grades) Tj
0 -20 Td
(1 to 5 and INR 56,000 for grades 6 to 12. Fees are payable in three) Tj
0 -20 Td
(installments: April, August, and December. A late fee of INR 250 per) Tj
0 -20 Td
(week applies after the due date. The fee receipt is available in the) Tj
0 -20 Td
(parent portal within 24 hours of payment.) Tj
0 -40 Td
(Chapter 5: Transport and Bus Routes) Tj
0 -20 Td
(The school operates 18 bus routes covering a 25 km radius. The bus fee) Tj
0 -20 Td
(is INR 9,000 per year. Route schedules and pickup times are pinned) Tj
0 -20 Td
(in the parent portal under Transport. Students must carry their bus) Tj
0 -20 Td
(passes at all times; replacement passes are issued at the main office) Tj
0 -20 Td
(for INR 100.) Tj
0 -40 Td
(Chapter 6: Library and Computer Lab) Tj
0 -20 Td
(The library is open from 8:00 AM to 4:00 PM on school days. Students) Tj
0 -20 Td
(may borrow up to two books for one week. The computer lab is open) Tj
0 -20 Td
(during lunch break and after school until 4:30 PM. Internet access is) Tj
0 -20 Td
(filtered; personal devices are not permitted in the lab.) Tj
0 -40 Td
(Chapter 7: Emergency Contact) Tj
0 -20 Td
(Main office: +91-80-2553-1234. Email: office@gardeniaschool.edu.in.) Tj
0 -20 Td
(Principal: Dr. Anjali Rao. Vice Principal (Academics): Mr. Suresh Menon.) Tj
0 -20 Td
(Vice Principal (Discipline): Ms. Priya Iyer. School nurse: available) Tj
0 -20 Td
(in the infirmary from 8:00 AM to 4:00 PM on all school days.) Tj
ET`;

// Minimal PDF writer — produces a single page text PDF.
export function buildPdf(content: string): string {
  const objects: string[] = [];
  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  objects.push('<< /Type /Pages /Count 1 /Kids [3 0 R] >>');
  objects.push(
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
  );
  const stream = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
  objects.push(stream);
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
  return pdf;
}

export function writeSamplePdf(outPath: string = join(HERE, 'fixtures', 'sample.pdf')): string {
  const pdf = buildPdf(PAGE_CONTENT);
  writeFileSync(outPath, pdf, 'utf8');
  return outPath;
}

// CLI entry — only run when this module is the program root.
const invokedDirectly = (() => {
  try {
    return import.meta.url === `file://${process.argv[1]}`;
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  const out = writeSamplePdf();
  console.log(`Wrote ${out} (${PAGE_CONTENT.length + 200} bytes)`);
}

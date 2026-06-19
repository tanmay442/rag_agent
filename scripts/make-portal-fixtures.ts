// Generates the additional student-portal PDF fixtures used by the
// RAG corpus. Run with: pnpm tsx scripts/make-portal-fixtures.ts
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, 'fixtures');

function buildPdf(content: string): string {
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

function writePage(fileName: string, content: string) {
  const out = join(FIXTURES, fileName);
  writeFileSync(out, buildPdf(content), 'utf8');
  console.log(`Wrote ${out}`);
}

// 1. Admissions and new-student checklist
writePage('admissions.pdf', `BT
/F1 12 Tf
50 750 Td
(Gardenia Public School - Admissions Guide) Tj
0 -20 Td
(Academic Year 2025-2026) Tj
0 -40 Td
(1. Application Window) Tj
0 -20 Td
(Online applications for the 2025-2026 academic year open on) Tj
0 -20 Td
(October 1, 2024 and close on January 15, 2025. Late applications) Tj
0 -20 Td
(are accepted only against vacant seats. The application form is) Tj
0 -20 Td
(available on the school website and at the admissions office.) Tj
0 -40 Td
(2. Entrance Assessment) Tj
0 -20 Td
(Students seeking admission to grades 1 to 9 must sit for an) Tj
0 -20 Td
(entrance assessment in English, Mathematics, and Second Language.) Tj
0 -20 Td
(Admission to grade 11 is based on the grade 10 board examination) Tj
0 -20 Td
(score, with a minimum aggregate of 70 percent for the science) Tj
0 -20 Td
(stream and 60 percent for the commerce and humanities streams.) Tj
0 -40 Td
(3. Documents Required) Tj
0 -20 Td
(Birth certificate, transfer certificate from the previous school,) Tj
0 -20 Td
(report cards for the last two academic years, four recent passport) Tj
0 -20 Td
(photographs, Aadhaar card of the student and parents, and address) Tj
0 -20 Td
(proof. Original documents are returned after verification.) Tj
0 -40 Td
(4. Admission Fee) Tj
0 -20 Td
(An admission fee of INR 5,000 is payable at the time of seat) Tj
0 -20 Td
(confirmation. This is non-refundable and is separate from the) Tj
0 -20 Td
(annual tuition fee. The first installment of tuition is due within) Tj
0 -20 Td
(15 days of admission.) Tj
0 -40 Td
(5. School Timing) Tj
0 -20 Td
(Classes run from 8:00 AM to 3:30 PM. The front office opens at) Tj
0 -20 Td
(7:30 AM. Students must be picked up by 4:00 PM unless they are) Tj
0 -20 Td
(staying for supervised activities or the school bus.) Tj
ET`);

// 2. Exam schedule and grading
writePage('exams-and-grading.pdf', `BT
/F1 12 Tf
50 750 Td
(Gardenia Public School - Examinations and Grading Policy) Tj
0 -20 Td
(Effective from Academic Year 2025-2026) Tj
0 -40 Td
(1. Term Structure) Tj
0 -20 Td
(The academic year is divided into four terms. Term exams are held) Tj
0 -20 Td
(in September (Term 1), December (Term 2), March (Term 3), and) Tj
0 -20 Td
(June (Term 4, the annual exam). Each term carries 25 percent of) Tj
0 -20 Td
(the final grade. The Term 4 annual exam carries 50 percent.) Tj
0 -40 Td
(2. Assessment Components) Tj
0 -20 Td
(Each subject has three components: periodic class tests (10 percent),) Tj
0 -20 Td
(term exams (25 percent each), and the annual examination (50 percent).) Tj
0 -20 Td
(Students in grades 9 and 10 also sit for the All India Secondary) Tj
0 -20 Td
(School Examination conducted by the CBSE board in February.) Tj
0 -40 Td
(3. Grading Scale) Tj
0 -20 Td
(A1: 91-100 percent, A2: 81-90, B1: 71-80, B2: 61-70, C1: 51-60,) Tj
0 -20 Td
(C2: 41-50, D: 33-40, E1: 21-32, E2: 0-20. The minimum pass mark) Tj
0 -20 Td
(is 33 percent in each subject and 40 percent on aggregate. A) Tj
0 -20 Td
(student who fails more than two subjects must appear for the) Tj
0 -20 Td
(supplementary examination in July.) Tj
0 -40 Td
(4. Re-evaluation) Tj
0 -20 Td
(Parents may apply for re-evaluation of answer scripts within seven) Tj
0 -20 Td
(working days of the publication of results. A fee of INR 300 per) Tj
0 -20 Td
(paper applies. Re-evaluation results are announced within ten) Tj
0 -20 Td
(working days.) Tj
0 -40 Td
(5. Attendance Requirement) Tj
0 -20 Td
(A student must have a minimum of 75 percent attendance in each) Tj
0 -20 Td
(subject to be eligible to sit for the term examination. Medical) Tj
0 -20 Td
(leave supported by a registered medical practitioner's certificate) Tj
0 -20 Td
(is considered on a case-by-case basis.) Tj
ET`);

// 3. Co-curricular activities
writePage('co-curricular.pdf', `BT
/F1 12 Tf
50 750 Td
(Gardenia Public School - Co-curricular Activities) Tj
0 -20 Td
(Academic Year 2025-2026) Tj
0 -40 Td
(1. House System) Tj
0 -20 Td
(All students are placed in one of four houses: Tagore (red),) Tj
0 -20 Td
(Nehru (blue), Bose (green), and Gandhi (yellow). Inter-house) Tj
0 -20 Td
(competitions are held in sports, debate, quiz, art, and music.) Tj
0 -20 Td
(The house with the highest aggregate at the end of the year) Tj
0 -20 Td
(wins the rolling House Cup.) Tj
0 -40 Td
(2. Sports) Tj
0 -20 Td
(The school fields teams in cricket, football, basketball, badminton,) Tj
0 -20 Td
(table tennis, athletics, and swimming. Practice sessions are held) Tj
0 -20 Td
(Monday through Friday from 3:45 PM to 5:30 PM. Trials for) Tj
0 -20 Td
(school teams are held in the first two weeks of April.) Tj
0 -40 Td
(3. Clubs and Societies) Tj
0 -20 Td
(Students may join the following clubs: robotics, coding, math) Tj
0 -20 Td
(olympiad, debate, Model United Nations, photography, drama,) Tj
0 -20 Td
(chess, and the school newspaper. Each club meets once a week) Tj
0 -20 Td
(during the activity period on Friday afternoons.) Tj
0 -40 Td
(4. Annual Events) Tj
0 -20 Td
(The annual cultural festival (Utsav) is held in the second week) Tj
0 -20 Td
(of November. The annual sports day is held in the second week) Tj
0 -20 Td
(of December. The investiture ceremony for the student council) Tj
0 -20 Td
(is held in the first week of July.) Tj
0 -40 Td
(5. Eligibility) Tj
0 -20 Td
(Students with attendance below 80 percent or with any subject) Tj
0 -20 Td
(fail in the previous term are not permitted to participate in) Tj
0 -20 Td
(inter-school competitions until the next assessment cycle.) Tj
ET`);

// 4. Parent portal usage guide
writePage('parent-portal-guide.pdf', `BT
/F1 12 Tf
50 750 Td
(Gardenia Public School - Parent Portal User Guide) Tj
0 -20 Td
(Version 4.2 - Updated June 2025) Tj
0 -40 Td
(1. Logging In) Tj
0 -20 Td
(Visit portal.gardeniaschool.edu.in and enter the registered email) Tj
0 -20 Td
(address and password. New parents receive a welcome email with) Tj
0 -20 Td
(their temporary password on the day of admission. Please change) Tj
0 -20 Td
(the password on first login.) Tj
0 -40 Td
(2. Features) Tj
0 -20 Td
(The portal provides the following: real-time attendance, term) Tj
0 -20 Td
(and unit test marks, fee receipts, bus route and pickup time,) Tj
0 -20 Td
(calendar of school events, downloadable report cards, leave) Tj
0 -20 Td
(application, teacher messaging, and PTM slot booking.) Tj
0 -40 Td
(3. Notifications) Tj
0 -20 Td
(Parents receive SMS and email notifications for the following) Tj
0 -20 Td
(events: student absence, low attendance warning, fee due date,) Tj
0 -20 Td
(fee receipt, term result publication, school closure, and PTM) Tj
0 -20 Td
(reminders. Notifications can be configured under Profile > Alerts.) Tj
0 -40 Td
(4. Mobile App) Tj
0 -20 Td
(The portal is also available as a mobile app for Android and iOS.) Tj
0 -20 Td
(Search for "Gardenia Public School" in the respective app stores.) Tj
0 -20 Td
(The mobile app supports biometric login on supported devices.) Tj
0 -40 Td
(5. Support) Tj
0 -20 Td
(For technical support with the portal, email portal@gardeniaschool) Tj
0 -20 Td
(.edu.in or call the help desk at +91-80-2553-1235 between 9 AM) Tj
0 -20 Td
(and 5 PM on school days. The school office is closed on Sundays) Tj
0 -20 Td
(and gazetted holidays.) Tj
ET`);

console.log('All portal fixtures generated.');

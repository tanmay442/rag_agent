import { NextResponse } from 'next/server';
import { requireAdminDocument } from '@/composition';

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminDocument(context);
  if (!auth.ok) return auth.response;
  const safeName = auth.document.fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200);
  return new NextResponse(new Uint8Array(auth.document.blob!), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${safeName}"`,
      'Cache-Control': 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

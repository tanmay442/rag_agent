import { NextResponse } from 'next/server';
import { requireAdminRoute, getComposition } from '@/composition';

export async function POST() {
  const auth = await requireAdminRoute();
  if (!auth.ok) return auth.response;
  const result = await getComposition().reingestAll();
  if (!result.ok) {
    return NextResponse.json(
      { error: 'Re-ingest failed', code: result.error.code },
      { status: 500 },
    );
  }
  return NextResponse.json({
    processed: result.value.processed,
    chunks: result.value.chunks,
    failed: result.value.failed,
  });
}

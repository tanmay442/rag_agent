import { NextResponse } from 'next/server';
import { Receiver } from '@upstash/qstash';
import { getComposition } from '@/composition';
import { NotFoundError } from '@app/domain';

function getReceiver(): Receiver | null {
  const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY;
  if (!currentSigningKey || !nextSigningKey) return null;
  return new Receiver({ currentSigningKey, nextSigningKey });
}

/** QStash callback endpoint for async PDF ingest. See the composition
 *  `ingestQueuedDocument` effect for the idempotency contract. */
export async function POST(req: Request) {
  const receiver = getReceiver();
  if (!receiver) {
    return NextResponse.json({ error: 'QStash signing keys not configured' }, { status: 401 });
  }
  const body = await req.text();
  const signature = req.headers.get('upstash-signature') ?? '';
  let isValid: boolean;
  try {
    isValid = await receiver.verify({ body, signature });
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }
  if (!isValid) return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });

  let documentId: unknown;
  try {
    documentId = JSON.parse(body).documentId;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!Number.isInteger(documentId)) {
    return NextResponse.json({ error: 'Invalid documentId' }, { status: 400 });
  }

  try {
    const value = await getComposition().ingestQueuedDocument(documentId as number);
    if (value.status === 'busy') {
      return NextResponse.json({ error: 'Ingest in progress' }, { status: 409 });
    }
    return NextResponse.json({ ok: true, status: value.status, chunks: value.chunks }, { status: 200 });
  } catch (e) {
    if (e instanceof NotFoundError) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Ingest failed' }, { status: 500 });
  }
}

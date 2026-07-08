import { Client } from '@upstash/qstash';
import type { IngestQueueAdapter } from '../adapter-ports';

/** QStash-backed `IngestQueue`. Publishes a JSON message pointing at
 *  the public ingest-worker route; QStash calls back over HTTP and
 *  retries on non-2xx responses (up to `retries`). Requires
 *  `QSTASH_TOKEN` and `QSTASH_INGEST_WORKER_URL` (the public
 *  deployment URL — QStash cannot reach `localhost`). */
export function createQstashQueue(
  token: string | null = process.env.QSTASH_TOKEN ?? null,
  baseUrl: string | null = process.env.QSTASH_INGEST_WORKER_URL ?? null,
): IngestQueueAdapter {
  if (!token) throw new Error('QSTASH_TOKEN is not set.');
  const client = new Client({ token });
  return {
    async enqueue({ documentId }) {
      if (!baseUrl) throw new Error('QSTASH_INGEST_WORKER_URL is not set.');
      await client.publishJSON({
        url: `${baseUrl}/api/admin/ingest-worker`,
        body: { documentId },
        retries: 3,
      });
    },
  };
}

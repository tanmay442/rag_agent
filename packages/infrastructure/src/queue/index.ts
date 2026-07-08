import type { IngestQueueAdapter } from '../adapter-ports';
import { createQstashQueue } from './qstash-queue';
import { createSyncQueue } from './sync-queue';
import type { EnvConfig } from '@app/domain';

/** Factory: pick the QStash adapter when `QSTASH_TOKEN` is set,
 *  otherwise the no-op sync adapter. The async path is opt-in —
 *  without a token all uploads go through the synchronous ingest. */
export function createIngestQueue(): IngestQueueAdapter {
  const token = process.env.QSTASH_TOKEN ?? null;
  const url = process.env.QSTASH_INGEST_WORKER_URL ?? null;
  return selectIngestQueue(!!token, { qstashToken: token, qstashIngestWorkerUrl: url });
}

export function selectIngestQueue(
  useQstash: boolean,
  cfg: Pick<EnvConfig.Service, 'qstashToken' | 'qstashIngestWorkerUrl'>,
): IngestQueueAdapter {
  if (useQstash) return createQstashQueue(cfg.qstashToken, cfg.qstashIngestWorkerUrl);
  return createSyncQueue();
}

export { createQstashQueue, createSyncQueue };

import { appConfig } from '@/composition';
import { CHUNKING_STRATEGIES } from '@app/domain';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { ReingestForm } from './reingest-form';

export const dynamic = 'force-dynamic';

export default function AdminSettingsPage() {
  const currentChunking = appConfig.chunkingStrategy;
  const currentReranking = appConfig.reranking.strategy;

  return (
    <section className="flex flex-col gap-6">
      <h2 className="text-xl font-medium">Settings</h2>

      <Card className="gap-0">
        <CardHeader className="gap-1 pb-4">
          <CardTitle>Chunking strategy</CardTitle>
          <CardDescription>
            How documents are split into chunks at ingest time.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              Current
            </span>
            <span
              className="text-base font-medium text-foreground"
              data-testid="settings-current-chunking"
            >
              {currentChunking}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              Available strategies
            </span>
            <select
              disabled
              defaultValue={currentChunking}
              aria-label="Available chunking strategies (read-only)"
              className="rounded-md border border-border-subtle bg-background px-3 py-2 text-sm text-foreground"
              data-testid="settings-chunking-strategies"
            >
              {CHUNKING_STRATEGIES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <p className="text-sm text-warning">
            Changing the chunking strategy requires a re-ingest. Use the button
            below to re-chunk all documents.
          </p>
        </CardContent>
      </Card>

      <Card className="gap-0">
        <CardHeader className="gap-1 pb-4">
          <CardTitle>Reranking</CardTitle>
          <CardDescription>
            Strategy used to re-rank the hybrid-retrieved candidate chunks.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            Current strategy
          </span>
          <span
            className="text-base font-medium text-foreground"
            data-testid="settings-current-reranking"
          >
            {currentReranking} (top {appConfig.reranking.rerankTopK})
          </span>
        </CardContent>
      </Card>

      <Card className="gap-0">
        <CardHeader className="gap-1 pb-4">
          <CardTitle>Re-ingest corpus</CardTitle>
          <CardDescription>
            Re-chunk and re-embed every document with the current strategy.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ReingestForm />
        </CardContent>
      </Card>
    </section>
  );
}

import { appConfig } from '@/composition';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { ReingestForm } from './reingest-form';
import { PageHeader } from '@/components/admin/PageHeader';

export const dynamic = 'force-dynamic';

export default function AdminSettingsPage() {
  const currentChunking = appConfig.chunkingStrategy;
  const currentReranking = appConfig.reranking.strategy;
  const rerankTopK = appConfig.reranking.rerankTopK;

  return (
    <section className="flex flex-col gap-6">
      <PageHeader
        title="Settings"
        description="Retrieval configuration for the RAG pipeline."
      />

      <Card className="gap-0">
        <CardHeader className="gap-1 pb-4">
          <CardTitle>Retrieval configuration</CardTitle>
          <CardDescription>
            How documents are chunked and how retrieved chunks are re-ranked.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:gap-10">
            <div className="flex flex-col gap-1">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">
                Chunking strategy
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
                Reranking
              </span>
              <span
                className="text-base font-medium text-foreground"
                data-testid="settings-current-reranking"
              >
                {currentReranking} (top {rerankTopK})
              </span>
            </div>
          </div>
          <p className="text-sm text-warning">
            Changing the chunking strategy requires a re-ingest. Use the button
            below to re-chunk all documents.
          </p>
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

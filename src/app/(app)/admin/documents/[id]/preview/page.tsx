import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getComposition } from '@/composition';

export const dynamic = 'force-dynamic';

export default async function PreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const docId = Number(id);
  if (!Number.isInteger(docId)) notFound();
  const doc = await getComposition().getDocumentById(docId);
  if (!doc) notFound();
  if (doc.deletedAt) {
    return (
      <section className="flex flex-col gap-3" data-testid="document-preview">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-medium">{doc.fileName}</h2>
            <p className="text-xs text-zinc-500">This document has been deleted. Restore it to preview.</p>
          </div>
          <Link
            href="/admin/documents"
            className="rounded border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Back
          </Link>
        </div>
      </section>
    );
  }
  return (
    <section className="flex flex-col gap-3" data-testid="document-preview">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-medium">{doc.fileName}</h2>
          <p className="text-xs text-zinc-500">
            {doc.blob && doc.blob.length > 0
              ? `${(doc.blob.length / 1024).toFixed(1)} KB`
              : 'Preview unavailable (no stored bytes)'}
          </p>
        </div>
        <Link
          href="/admin/documents"
          className="rounded border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          Back
        </Link>
      </div>
      {doc.blob && doc.blob.length > 0 ? (
        <iframe
          src={`/api/admin/documents/${docId}/blob#toolbar=0`}
          className="h-[80vh] w-full rounded border border-zinc-200 dark:border-zinc-800"
          title={`Preview ${doc.fileName}`}
          data-testid="document-iframe"
        />
      ) : (
        <div className="rounded border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700">
          Preview unavailable.
        </div>
      )}
    </section>
  );
}

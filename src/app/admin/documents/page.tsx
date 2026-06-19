import Link from 'next/link';
import { listDocuments } from '@/lib/admin/documents';
import { DocumentRowActions } from './document-row-actions';
import { RecountAllButton } from './recount-all-button';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    search?: string;
    page?: string;
    recountedDocs?: string;
    recountedTotal?: string;
  }>;
}) {
  const params = await searchParams;
  const search = params.search?.trim() ?? '';
  const page = Math.max(1, Number(params.page ?? 1));
  const offset = (page - 1) * PAGE_SIZE;
  // Read the success-banner params (set by RecountAllButton) so the
  // message survives the page reload triggered by revalidatePath.
  const recountedDocsRaw = params.recountedDocs;
  const recountedTotalRaw = params.recountedTotal;
  const recountedDocs =
    recountedDocsRaw !== undefined && recountedDocsRaw !== ''
      ? Number(recountedDocsRaw)
      : null;
  const recountedTotal =
    recountedTotalRaw !== undefined && recountedTotalRaw !== ''
      ? Number(recountedTotalRaw)
      : null;
  const showRecountBanner =
    recountedDocs !== null &&
    !Number.isNaN(recountedDocs) &&
    recountedTotal !== null &&
    !Number.isNaN(recountedTotal);
  const result = await listDocuments({
    search: search || undefined,
    includeDeleted: true,
    limit: PAGE_SIZE,
    offset,
  });
  const totalPages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xl font-medium">Documents</h2>
      <div className="flex flex-col gap-2">
        <form className="flex gap-2" method="get">
          <input
            type="search"
            name="search"
            defaultValue={search}
            placeholder="Search file name…"
            className="flex-1 rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            data-testid="documents-search"
          />
          <button
            type="submit"
            className="rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Search
          </button>
          <RecountAllButton />
        </form>
        {showRecountBanner ? (
          <div
            className="rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
            data-testid="documents-recount-banner"
            role="status"
          >
            Recounted {recountedDocs} document{recountedDocs === 1 ? '' : 's'}, total {recountedTotal} chunk{recountedTotal === 1 ? '' : 's'}.
          </div>
        ) : null}
      </div>
      <div className="overflow-x-auto rounded border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm" data-testid="documents-table">
          <thead className="bg-zinc-50 text-left text-xs uppercase text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th className="px-3 py-2">File</th>
              <th className="px-3 py-2">Uploaded by</th>
              <th className="px-3 py-2">At</th>
              <th className="px-3 py-2">Chunks</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {result.documents.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-4 text-center text-zinc-500"
                >
                  No documents.
                </td>
              </tr>
            ) : (
              result.documents.map((d) => (
                <tr
                  key={d.id}
                  className="border-t border-zinc-200 dark:border-zinc-800"
                  data-testid={`documents-row-${d.id}`}
                >
                  <td className="px-3 py-2 font-medium">{d.fileName}</td>
                  <td className="px-3 py-2">
                    {d.uploaderName ?? d.uploadedBy}
                  </td>
                  <td className="px-3 py-2 text-xs text-zinc-500">
                    {d.uploadedAt.toISOString()}
                  </td>
                  <td className="px-3 py-2">{d.chunkCount}</td>
                  <td className="px-3 py-2">
                    {d.deletedAt ? (
                      <span className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-800">
                        deleted
                      </span>
                    ) : (
                      <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">
                        live
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <DocumentRowActions
                      id={d.id}
                      fileName={d.fileName}
                      hasBlob={d.blob != null}
                      isDeleted={d.deletedAt != null}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span>
          Page {page} of {totalPages} ({result.total} total)
        </span>
        <div className="flex gap-2">
          {page > 1 ? (
            <Link
              href={{
                pathname: '/admin/documents',
                query: { search, page: page - 1 },
              }}
              className="rounded border border-zinc-300 px-3 py-1 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              Previous
            </Link>
          ) : null}
          {page < totalPages ? (
            <Link
              href={{
                pathname: '/admin/documents',
                query: { search, page: page + 1 },
              }}
              className="rounded border border-zinc-300 px-3 py-1 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              Next
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}

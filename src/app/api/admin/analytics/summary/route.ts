import { requireAdminRoute } from '@/composition';
import { respond } from '@/lib/http';

export async function GET() {
  const auth = await requireAdminRoute();
  if (!auth.ok) return auth.response;
  const summary = await auth.comp.getAnalyticsSummary();
  return respond(summary);
}

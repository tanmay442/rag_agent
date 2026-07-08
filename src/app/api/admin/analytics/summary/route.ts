import { requireAdminRoute, runComp } from '@/composition';

export async function GET() {
  const auth = await requireAdminRoute();
  if (!auth.ok) return auth.response;
  return runComp(auth.comp.getAnalyticsSummary());
}

import { getComposition, requireAdmin, ForbiddenError } from '@/composition';
import { respond } from '@/lib/http';

export async function GET() {
  const comp = getComposition();
  try { await requireAdmin(); } catch (err) {
      if (err instanceof ForbiddenError) {
        return new Response('Forbidden', { status: 403 });
      }
      throw err;
    }
  const summary = await comp.getAnalyticsSummary();
  return respond(summary);
}

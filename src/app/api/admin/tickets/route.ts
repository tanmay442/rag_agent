import { NextResponse } from 'next/server';
import { getComposition, requireAdmin, ForbiddenError, isTicketStatus } from '@/composition';

export async function GET(req: Request) {
  const comp = getComposition();
  try { await requireAdmin(); } catch (err) {
      if (err instanceof ForbiddenError) {
        return new NextResponse('Forbidden', { status: 403 });
      }
      throw err;
    }
  const url = new URL(req.url);
  const status = url.searchParams.get('status');
  const assignee = url.searchParams.get('assignee');
  const search = url.searchParams.get('search') ?? undefined;
  const limit = Number(url.searchParams.get('limit') ?? 25);
  const offset = Number(url.searchParams.get('offset') ?? 0);
  const result = await comp.listTickets({
    status: status && isTicketStatus(status) ? status : undefined,
    assignee: assignee === null ? undefined : assignee,
    search,
    limit,
    offset,
  });
  return NextResponse.json(result);
}

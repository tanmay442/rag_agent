import { NextResponse } from 'next/server';
import { getComposition, requireAdmin, ForbiddenError } from '@/composition';

export async function POST(
  req: Request,
  context: { params: Promise<{ clerkId: string }> },
) {
  let session;
  const comp = getComposition();
  try { session = await requireAdmin(); } catch (err) {
    if (err instanceof ForbiddenError) {
      return new NextResponse('Forbidden', { status: 403 });
    }
    throw err;
  }
  const { clerkId } = await context.params;
  try {
    const { clerkClient } = await import('@clerk/nextjs/server');
    const client = await clerkClient();
    const signInToken = await client.signInTokens.createSignInToken({
      userId: clerkId, expiresInSeconds: 600,
    });
    await comp.logTicketEvent({
      action: 'impersonation',
      ticketId: `user:${clerkId}`,
      actorId: session.user.id,
    });
    return NextResponse.json({ url: signInToken.url });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message ?? 'Impersonation failed' },
      { status: 500 },
    );
  }
}

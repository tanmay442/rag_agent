import { NextResponse } from 'next/server';
import { requireAdmin, ForbiddenError } from '@/lib/auth/session';
import { logTicketEvent } from '@/lib/auth/audit';

export async function POST(
  req: Request,
  context: { params: Promise<{ clerkId: string }> },
) {
  let session;
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
    await logTicketEvent({
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

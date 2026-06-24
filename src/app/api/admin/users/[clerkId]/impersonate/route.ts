import { requireAdminRoute } from '@/composition';
import { respond } from '@/lib/http';

export async function POST(
  _req: Request,
  context: { params: Promise<{ clerkId: string }> },
) {
  const auth = await requireAdminRoute();
  if (!auth.ok) return auth.response;
  const { session, comp } = auth;
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
    return respond({ url: signInToken.url });
  } catch (err) {
    return respond(err);
  }
}

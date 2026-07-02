import { requireAdminRoute, respond } from '@/composition';
import { ValidationError, NotFoundError } from '@app/domain';
import { logger } from '@/lib/logger';

export async function POST(
  _req: Request,
  context: { params: Promise<{ clerkId: string }> },
) {
  const auth = await requireAdminRoute();
  if (!auth.ok) return auth.response;
  const { session, comp } = auth;
  const { clerkId } = await context.params;

  if (session.user.id === clerkId) {
    return respond(new ValidationError('Cannot impersonate yourself'));
  }

  const userResult = await comp.getUserByClerkId(clerkId);
  if (!userResult.ok) return respond(userResult.error);
  if (!userResult.value.user) {
    return respond(new NotFoundError('User not found'));
  }
  if (userResult.value.user.role === 'admin') {
    return respond(new ValidationError('Cannot impersonate another admin'));
  }

  try {
    const { clerkClient } = await import('@clerk/nextjs/server');
    const client = await clerkClient();
    const signInToken = await client.signInTokens.createSignInToken({
      userId: clerkId,
      expiresInSeconds: 120,
    });
    const auditResult = await comp.logTicketEvent({
      action: 'impersonation',
      ticketId: `user:${clerkId}`,
      actorId: session.user.id,
    });
    if (!auditResult.ok) {
      logger.error('Impersonation audit logging failed', { error: auditResult.error });
    }
    return Response.json({ url: signInToken.url });
  } catch (err) {
    return respond(err);
  }
}

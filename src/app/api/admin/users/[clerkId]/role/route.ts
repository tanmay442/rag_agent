import { z } from 'zod';
import { requireAdminRoute } from '@/composition';
import { respond } from '@/lib/http';
import { ValidationError } from '@app/domain';

const RoleSchema = z.object({
  role: z.enum(['admin', 'user']),
});

export async function POST(
  req: Request,
  context: { params: Promise<{ clerkId: string }> },
) {
  const auth = await requireAdminRoute();
  if (!auth.ok) return auth.response;
  const { session, comp } = auth;
  const { clerkId } = await context.params;
  const body = await req.json().catch(() => ({}));
  const parsed = RoleSchema.safeParse(body);
  if (!parsed.success) {
    return respond(new ValidationError('invalid_role', parsed.error.issues));
  }
  try {
    const user = await comp.setUserRole({ clerkUserId: clerkId, role: parsed.data.role as 'admin' | 'user', actorId: session.user.id });
    return respond({ user });
  } catch (err) {
    return respond(err);
  }
}

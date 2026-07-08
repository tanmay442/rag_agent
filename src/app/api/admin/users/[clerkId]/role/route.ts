import { Schema } from 'effect';
import { requireAdminRoute, respond } from '@/composition';
import { ValidationError } from '@app/domain';

const RoleSchema = Schema.Struct({
  role: Schema.Literal('admin', 'user'),
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
  let parsed: Schema.Schema.Type<typeof RoleSchema>;
  try {
    parsed = Schema.decodeUnknownSync(RoleSchema)(body);
  } catch (e) {
    return respond(
      new ValidationError('invalid_role', {
        issues: e instanceof Error ? e.message : String(e),
      }),
    );
  }
  const result = await comp.setUserRole({
    clerkUserId: clerkId,
    role: parsed.role as 'admin' | 'user',
    actorId: session.user.id,
  });
  if (!result.ok) return respond(result.error);
  return Response.json({ user: result.value });
}

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminRoute } from '@/composition';

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
    return NextResponse.json({ error: 'invalid_role', issues: parsed.error.issues }, { status: 400 });
  }
  try {
    const user = await comp.setUserRole({ clerkUserId: clerkId, role: parsed.data.role as 'admin' | 'user', actorId: session.user.id });
    return NextResponse.json({ user });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message ?? 'role_change_failed' },
      { status: 500 },
    );
  }
}

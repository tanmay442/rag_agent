import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin, ForbiddenError } from '@/lib/auth/session';
import { setUserRole, type AppRole } from '@/lib/auth/users';
import { respond } from '@/lib/http';

const RoleSchema = z.object({
  role: z.enum(['admin', 'user']),
});

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
  const body = await req.json().catch(() => ({}));
  const parsed = RoleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_role', issues: parsed.error.issues }, { status: 400 });
  }
  try {
    const user = await setUserRole(clerkId, parsed.data.role as AppRole, session.user.id);
    return NextResponse.json({ user });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message ?? 'role_change_failed' },
      { status: 500 },
    );
  }
}

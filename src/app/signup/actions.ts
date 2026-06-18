'use server';

import { redirect } from 'next/navigation';
import { authClient } from '@/lib/auth/client';
import { isAdminEmail, promoteToAdmin } from '@/lib/auth/roleBootstrap';

export interface SignupState {
  error?: string;
}

export async function signupAction(
  _prev: SignupState,
  formData: FormData,
): Promise<SignupState> {
  const name = String(formData.get('name') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  if (!email || !password || !name) {
    return { error: 'Name, email, and password are required.' };
  }
  const { data, error } = await authClient.signUp.email({ name, email, password });
  if (error) {
    return { error: error.message ?? 'Failed to sign up.' };
  }
  const userId = data?.user?.id;
  if (userId && isAdminEmail(email)) {
    try {
      await promoteToAdmin({ userId, email });
    } catch (err) {
      // Don't block signup if the role flip fails; the next admin can
      // promote them from /admin/users.
      console.error('promoteToAdmin failed', err);
    }
  }
  redirect('/chat');
}

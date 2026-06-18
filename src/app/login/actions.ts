'use server';

import { redirect } from 'next/navigation';
import { authClient } from '@/lib/auth/client';
import { isAdminEmail } from '@/lib/auth/roleBootstrap';

export interface LoginState {
  error?: string;
}

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  if (!email || !password) {
    return { error: 'Email and password are required.' };
  }
  const { error } = await authClient.signIn.email({ email, password });
  if (error) {
    return { error: error.message ?? 'Failed to sign in.' };
  }
  // Re-check the allowlist so admins land on the right next step.
  if (isAdminEmail(email)) {
    redirect('/admin/upload');
  }
  redirect('/chat');
}

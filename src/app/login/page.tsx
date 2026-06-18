'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { loginAction, type LoginState } from './actions';

const initial: LoginState = {};

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(loginAction, initial);
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-8">
      <h1 className="text-2xl font-semibold">Log in</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Use your work email to access the support chat.
      </p>
      <form action={formAction} className="mt-6 flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Email
          <input
            type="email"
            name="email"
            required
            className="rounded border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Password
          <input
            type="password"
            name="password"
            required
            minLength={8}
            className="rounded border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        {state.error && (
          <div className="rounded bg-red-100 p-2 text-sm text-red-700">
            {state.error}
          </div>
        )}
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {pending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p className="mt-4 text-sm">
        Don&apos;t have an account?{' '}
        <Link href="/signup" className="text-blue-600 underline">
          Sign up
        </Link>
      </p>
    </div>
  );
}

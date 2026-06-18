'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { signupAction, type SignupState } from './actions';

const initial: SignupState = {};

export default function SignupPage() {
  const [state, formAction, pending] = useActionState(signupAction, initial);
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-8">
      <h1 className="text-2xl font-semibold">Create account</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Sign up to ask the support agent a question.
      </p>
      <form action={formAction} className="mt-6 flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Name
          <input
            type="text"
            name="name"
            required
            className="rounded border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
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
          {pending ? 'Creating account…' : 'Sign up'}
        </button>
      </form>
      <p className="mt-4 text-sm">
        Already have an account?{' '}
        <Link href="/login" className="text-blue-600 underline">
          Log in
        </Link>
      </p>
    </div>
  );
}

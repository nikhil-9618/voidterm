import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthShell } from '@/components/auth-shell';
import { getSessionFromCookies } from '@/lib/auth';
import { LoginForm } from './login-form';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Email OTP access to the VOIDTERM workspace.',
};

export default async function LoginPage() {
  const session = await getSessionFromCookies();
  if (session) redirect('/c');

  return (
    <AuthShell backHref="/" backLabel="Back">
      <LoginForm />
    </AuthShell>
  );
}

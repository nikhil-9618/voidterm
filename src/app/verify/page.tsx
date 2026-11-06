import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthShell } from '@/components/auth-shell';
import { getSessionFromCookies } from '@/lib/auth';
import { VerifyForm } from './verify-form';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Verify code',
  description: 'Enter the six-digit VOIDTERM login code.',
};

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: { email?: string };
}) {
  const session = await getSessionFromCookies();
  if (session) redirect('/c');

  const rawEmail = searchParams.email?.trim() ?? '';
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail) ? rawEmail.toLowerCase() : '';

  if (!email) redirect('/login');

  return (
    <AuthShell backHref="/login" backLabel="Change email">
      <VerifyForm email={email} />
    </AuthShell>
  );
}

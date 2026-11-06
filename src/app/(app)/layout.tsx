import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { getSessionFromCookies } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function WorkspaceLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await getSessionFromCookies();

  if (!user) {
    redirect('/login');
  }

  return (
    <AppShell
      user={{
        id: user.id,
        email: user.email,
        name: user.name,
        tier: user.tier,
      }}
    >
      {children}
    </AppShell>
  );
}

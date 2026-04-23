import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { MainNav } from './MainNav';

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <MainNav user={session.user} />
      <main style={{ flex: 1, padding: 'var(--space-lg)', overflow: 'auto' }}>
        {children}
      </main>
    </div>
  );
}

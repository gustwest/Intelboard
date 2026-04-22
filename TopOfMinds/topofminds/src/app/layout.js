import './globals.css';
import AppShell from '@/components/AppShell';
import { getCurrentUser } from '@/lib/auth/dal';

export const metadata = {
  title: 'TopOfMinds — Konsultresurshantering',
  description: 'Hantera konsulter, kontrakt och kunder med TopOfMinds. Överblick, Gantt-schema, och ekonomisk uppföljning.',
};

export default async function RootLayout({ children }) {
  const user = await getCurrentUser();

  return (
    <html lang="sv">
      <body suppressHydrationWarning>
        <AppShell user={user} notificationCount={2}>
          {children}
        </AppShell>
      </body>
    </html>
  );
}

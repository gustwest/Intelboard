import './globals.css';
import Sidebar from '@/components/Sidebar';

export const metadata = {
  title: 'TopOfMinds — Konsultresurshantering',
  description: 'Hantera konsulter, kontrakt och kunder med TopOfMinds. Överblick, Gantt-schema, och ekonomisk uppföljning.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="sv">
      <body suppressHydrationWarning>
        <div className="app-layout">
          <Sidebar notificationCount={2} />
          <main className="main-content">
            <div className="page-content">
              {children}
            </div>
          </main>
        </div>
      </body>
    </html>
  );
}

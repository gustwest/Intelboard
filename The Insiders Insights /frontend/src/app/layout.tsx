import type { Metadata } from "next";
import { Inter_Tight } from "next/font/google";
import "./globals.css";
import FeedbackBubble from "@/components/FeedbackBubble";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import { UserProvider } from "@/components/UserProvider";
import ChatWidget from "@/components/ChatWidget";
import AIAssistant from "@/components/AIAssistant";
import AuthSessionProvider from "@/components/AuthSessionProvider";

const interTight = Inter_Tight({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-inter-tight",
});

export const metadata: Metadata = {
  title: "The Predictive Network Engine — The Insiders",
  description: "Prediktiv analys av LinkedIn-närvaro för sälj, rekrytering och bolagsvärdering.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="sv" className={`${interTight.variable} h-full antialiased`}>
      <body className="min-h-full m-0 p-0 overflow-hidden">
        <AuthSessionProvider>
          <UserProvider>
            <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>
              <Sidebar />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
                <Header />
                <div style={{ flex: 1, overflowY: 'auto', position: 'relative' }}>
                  {children}
                </div>
              </div>
            </div>
            <FeedbackBubble />
            <ChatWidget />
            <AIAssistant />
          </UserProvider>
        </AuthSessionProvider>
      </body>
    </html>
  );
}

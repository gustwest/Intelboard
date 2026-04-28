import type { Metadata } from "next";
import { Inter_Tight, PT_Serif } from "next/font/google";
import "./globals.css";
import FeedbackBubble from "@/components/FeedbackBubble";
import Navbar from "@/components/Navbar";
import { UserProvider } from "@/components/UserProvider";
import ChatWidget from "@/components/ChatWidget";
import AIAssistant from "@/components/AIAssistant";
import AuthSessionProvider from "@/components/AuthSessionProvider";

const interTight = Inter_Tight({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-inter-tight",
});

const ptSerif = PT_Serif({
  subsets: ["latin"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
  variable: "--font-pt-serif",
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
    <html lang="sv" className={`${interTight.variable} ${ptSerif.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <AuthSessionProvider>
          <UserProvider>
            <Navbar />
            {children}
            <FeedbackBubble />
            <ChatWidget />
            <AIAssistant />
          </UserProvider>
        </AuthSessionProvider>
      </body>
    </html>
  );
}

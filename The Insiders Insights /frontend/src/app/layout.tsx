import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import FeedbackBubble from "@/components/FeedbackBubble";
import Navbar from "@/components/Navbar";
import { UserProvider } from "@/components/UserProvider";
import ChatWidget from "@/components/ChatWidget";
import AuthSessionProvider from "@/components/AuthSessionProvider";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
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
    <html lang="sv" className={`${inter.variable} h-full antialiased`}>
      <body
        className="min-h-full flex flex-col"
        style={{
          background: "#0a0a0f",
          color: "#f8fafc",
          fontFamily: "'Inter', system-ui, sans-serif",
        }}
      >
        <AuthSessionProvider>
          <UserProvider>
            <Navbar />
            {children}
            <FeedbackBubble />
            <ChatWidget />
          </UserProvider>
        </AuthSessionProvider>
      </body>
    </html>
  );
}

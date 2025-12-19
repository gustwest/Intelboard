import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { RoleProvider } from "@/components/role-provider";
import { LanguageProvider } from "@/components/language-provider";

import { SiteHeader } from "@/components/site-header";
import { Toaster } from "@/components/ui/toaster";

import { RequestProvider } from "@/components/request-provider";

import { PlannerAuthSync } from "@/components/it-flora/PlannerAuthSync";
import { FeedbackButton } from "@/components/FeedbackButton";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "IntelBoard",
  description: "Agile User Story Matching Service",
};

import { AuthProvider } from "@/components/auth-provider";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`} suppressHydrationWarning>
        <AuthProvider>
          <LanguageProvider>
            <RoleProvider>
              <RequestProvider>
                <PlannerAuthSync />
                <div className="relative flex min-h-screen flex-col">
                  <SiteHeader />
                  <div className="flex-1 px-4 md:px-6">{children}</div>
                </div>
                <Toaster />
                <FeedbackButton />
              </RequestProvider>
            </RoleProvider>
          </LanguageProvider>
        </AuthProvider>
      </body>
    </html>
  );
}

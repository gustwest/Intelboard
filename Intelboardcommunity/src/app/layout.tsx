import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import ClientLayout from "@/components/ClientLayout";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Intelboard Community — Explore, Learn, Discuss",
  description: "A collaborative knowledge platform with Wikipedia-style categories, community forums, events, quizzes, and real-time chat.",
  keywords: "knowledge, community, categories, forums, learning, quizzes, Wikipedia",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.variable}>
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}

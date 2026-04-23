import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AIDAS — AI-Driven Analytics & Data Services",
  description: "Intelligent data catalog, Data Vault modeling, and AI-powered analytics platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="sv">
      <body>{children}</body>
    </html>
  );
}

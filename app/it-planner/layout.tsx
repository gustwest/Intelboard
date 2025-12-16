import type { Metadata } from "next";
import { Inter } from "next/font/google";

import '@xyflow/react/dist/style.css';
import { PlannerAuthSync } from "@/components/it-flora/PlannerAuthSync";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "IT System Flora",
  description: "Visualize and manage your IT system landscape",
};

export default function ITPlannerLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <PlannerAuthSync />
      {children}
    </>
  );
}

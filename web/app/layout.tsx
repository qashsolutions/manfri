import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "ManFriday — Talent matching & outreach",
  description:
    "Résumé database, job-description matching, and compliant candidate outreach — evidence-backed and human-decided.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

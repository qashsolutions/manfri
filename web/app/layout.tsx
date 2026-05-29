import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "ManFriday — Compliant Talent CRM",
  description:
    "Resume database + compliant candidate outreach, with explainable AI screening as a premium tier.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

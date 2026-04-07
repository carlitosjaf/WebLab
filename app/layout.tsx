import type { Metadata } from "next";
import { IBM_Plex_Sans, IBM_Plex_Serif } from "next/font/google";

import "./globals.css";

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600", "700"]
});

const plexSerif = IBM_Plex_Serif({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400", "500", "600", "700"]
});

export const metadata: Metadata = {
  title: "WebLab",
  description: "Laboratorio virtual para escrita, colaboracao e submissao cientifica."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className={`${plexSans.variable} ${plexSerif.variable}`}>{children}</body>
    </html>
  );
}

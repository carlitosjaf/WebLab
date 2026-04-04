import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "WebLab",
  description: "Laboratorio virtual para escrita e colaboracao cientifica."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}

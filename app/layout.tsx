import type { Metadata } from "next";
import { Atkinson_Hyperlegible, Crimson_Pro, Inter, JetBrains_Mono } from "next/font/google";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600", "700"]
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["300", "400", "500", "600"]
});

const crimsonPro = Crimson_Pro({
  subsets: ["latin"],
  variable: "--font-editor-serif",
  weight: ["600", "700"]
});

const atkinsonHyperlegible = Atkinson_Hyperlegible({
  subsets: ["latin"],
  variable: "--font-editor-sans",
  weight: ["400", "700"]
});

export const metadata: Metadata = {
  title: "WebLab",
  description: "Laboratório virtual para escrita, colaboração e submissão científica."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} ${crimsonPro.variable} ${atkinsonHyperlegible.variable}`}
      >
        {children}
      </body>
    </html>
  );
}

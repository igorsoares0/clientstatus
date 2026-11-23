import type { Metadata } from "next";
import { Archivo, JetBrains_Mono } from "next/font/google";
import { SITE_URL } from "@/lib/seo";
import "./globals.css";

// Archivo variable with the width axis: headings use font-stretch 80–88%.
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  axes: ["wdth"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  // Resolves relative canonical and Open Graph URLs (e.g. the landing page's) against the public origin.
  metadataBase: new URL(SITE_URL),
  title: { template: "%s · Client Status", default: "Client Status" },
  description: "Website health monitoring and monthly client reports for agencies.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${archivo.variable} ${jetbrainsMono.variable}`}>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}

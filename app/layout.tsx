import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

// Drawn by an Indonesian foundry for Jakarta's civic identity: fits a public-safety tool for Indonesian schools.
const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "Arunika", template: "%s · Arunika" },
  description:
    "Latihan evakuasi bersama di kampus digital, asisten keselamatan AI, dan peta kesiapan sekolah rawan bencana.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id" className={`${jakarta.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}

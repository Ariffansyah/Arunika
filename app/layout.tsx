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
    "Kembaran digital 3D sekolah rawan bencana: latihan evakuasi bersama, asisten keselamatan AI, dan peta kesiapan untuk pengambil kebijakan.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id" className={`${jakarta.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}

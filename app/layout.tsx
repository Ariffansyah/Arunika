import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

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
    // The homepage scrolls smoothly; this keeps route changes from scrolling smoothly too.
    <html lang="id" data-scroll-behavior="smooth" className={`${jakarta.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}

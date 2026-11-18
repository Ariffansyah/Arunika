import type { Metadata } from "next";
import { JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";
import PointerLight from "@/components/PointerLight";
import { THEME_SCRIPT } from "@/components/ThemeToggle";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
});

// Readouts, indices and keys only.
const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "Arunika", template: "%s · Arunika" },
  description:
    "Latihan evakuasi bersama di sekolah virtual, asisten keselamatan AI, dan peta kesiapan sekolah rawan bencana.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The homepage scrolls smoothly; this keeps route changes from scrolling smoothly too. The theme script may
    // switch data-theme before hydration, hence suppressHydrationWarning.
    <html
      lang="id"
      data-theme="dark"
      data-scroll-behavior="smooth"
      suppressHydrationWarning
      className={`${jakarta.variable} ${jetbrains.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col font-sans">
        {children}
        <PointerLight />
      </body>
    </html>
  );
}

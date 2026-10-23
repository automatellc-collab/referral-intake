import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import { DisclaimerBanner } from "@/components/layout/DisclaimerBanner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Card Grade Estimator",
  description: "Photo-based trading card grading estimator, PSA-style scale.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-zinc-50 dark:bg-black">
        <header className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <Link href="/" className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Card Grade Estimator
          </Link>
          <nav className="flex gap-4 text-sm text-zinc-600 dark:text-zinc-400">
            <Link href="/grade" className="hover:text-zinc-900 dark:hover:text-zinc-50">
              Grade
            </Link>
            <Link href="/advisory" className="hover:text-zinc-900 dark:hover:text-zinc-50">
              Advisory
            </Link>
          </nav>
        </header>
        <DisclaimerBanner />
        {children}
      </body>
    </html>
  );
}

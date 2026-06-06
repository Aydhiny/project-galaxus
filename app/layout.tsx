import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Galaxus — Ajdin's Universe",
  description: "Personal growth tracking system",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} dark h-full`}>
      <body className="min-h-full flex flex-col antialiased bg-background text-foreground">
        {children}
        <Toaster
          theme="dark"
          toastOptions={{
            style: {
              background: "oklch(0.10 0.018 265)",
              border: "1px solid oklch(1 0 0 / 8%)",
              color: "oklch(0.94 0.01 90)",
            },
          }}
        />
      </body>
    </html>
  );
}

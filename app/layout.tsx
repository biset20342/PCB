import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const ogImage = `${protocol}://${host}/og-v2.png`;

  return {
    title: "外殼參數配置器｜殼造所",
    description: "用即時 3D 預覽說清楚你的少量 PCB 外殼需求。",
    icons: {
      icon: "/favicon.svg",
      shortcut: "/favicon.svg",
    },
    openGraph: {
      title: "PCB 外殼參數配置器｜殼造所",
      description: "調尺寸、看 3D、交付設計參數。",
      type: "website",
      locale: "zh_TW",
      images: [{ url: ogImage, width: 1200, height: 630, alt: "殼造所 PCB 外殼參數配置器" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "PCB 外殼參數配置器｜殼造所",
      description: "調尺寸、看 3D、交付設計參數。",
      images: [ogImage],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-Hant">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body>
    </html>
  );
}

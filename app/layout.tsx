import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CASEFORM｜PCB 外殼快速訂製",
  description: "上傳 PCB，快速完成外殼配置、預覽與報價。",
  openGraph: {
    title: "CASEFORM｜上傳 PCB，就幫你做好外殼",
    description: "快速配置、即時預覽、透明報價的 PCB 外殼訂製體驗。",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "CASEFORM PCB 外殼快速訂製" }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "CASEFORM｜上傳 PCB，就幫你做好外殼",
    description: "快速配置、即時預覽、透明報價的 PCB 外殼訂製體驗。",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}

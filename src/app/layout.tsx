import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "一镜 OneTake — 节点式 AI 视频创作画布",
  description:
    "一镜 OneTake：节点式 AI 视频创作画布。自由编排提示词、文生图、图生视频、AI 配音、拼接合成等节点，一镜到底，一条过。",
  keywords: ["一镜", "OneTake", "AI视频", "节点画布", "工作流", "文生视频", "图生视频", "ComfyUI"],
  icons: {
    icon: "/onetake-logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}

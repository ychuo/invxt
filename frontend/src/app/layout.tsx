import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "InvXt — 主题投资分析",
  description: "AI 驱动的产业链推理与投资主题映射",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="bg-[#f8f9fb] text-[#0f172a] antialiased">{children}</body>
    </html>
  );
}

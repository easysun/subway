import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Subway · 每一筆固定支出，都心裡有數",
  description: "集中管理訂閱、稅費、租賃與保險。看清每月負擔、付款方式與下次扣款日期。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant">
      <body className="antialiased">{children}</body>
    </html>
  );
}

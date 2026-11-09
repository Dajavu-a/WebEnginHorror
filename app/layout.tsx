import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Horror Engine Advisor",
  description: "เครื่องมือแนะนำเอนจินสำหรับเกมสยองขวัญ",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}

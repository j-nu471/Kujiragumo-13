// app/layout.tsx — 全部の画面に共通の枠。フォントとヘッダーをここで1回だけ決める（デザインの Issue）
import type { Metadata } from "next";
import { Noto_Sans_JP, Noto_Serif_JP } from "next/font/google";
import SiteHeader from "./SiteHeader";
import "./globals.css";
// 本番でトップの古い作り置き（route-cache）が残るのを防ぐ。全ページを、開くたびに作るページにする（ADR-0017）
export const dynamic = "force-dynamic";

// 本文はゴシック、ロゴと見出しは明朝（globals.css の --font-sans・--font-serif で使う）
const sans = Noto_Sans_JP({
  variable: "--font-sans",
  weight: ["400", "500", "700"],
  subsets: ["latin"],
  display: "swap",
});

const serif = Noto_Serif_JP({
  variable: "--font-serif",
  weight: ["600", "700"],
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Giftia",
  description: "送別のギフトを、みんなの声で選ぶ",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className={`${sans.variable} ${serif.variable}`}>
      <body>
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}

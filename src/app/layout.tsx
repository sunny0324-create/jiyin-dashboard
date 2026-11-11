import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "極印智慧設備監控與稼動分析平台",
    template: "%s｜極印智慧設備監控平台",
  },
  description: "谷林運算 × 極印快速成型｜工業級 SLA 設備監控、歷史加工時間比例與異常事件分析。",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}

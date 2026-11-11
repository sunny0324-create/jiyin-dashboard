import type { Metadata } from "next";
import Link from "next/link";
import "./landing.css";
import { Brand } from "@/components/layout/brand";
import { Icon, type IconName } from "@/components/ui/icon";

export const metadata: Metadata = { title: "工作區入口" };

const workspaces: {
  title: string;
  english: string;
  description: string;
  features: string[];
  href: string;
  icon: IconName;
}[] = [
  {
    title: "即時監控",
    english: "REAL-TIME MONITORING",
    description: "透過 3D 設備視覺化介面，掌握 A1～A4、B1～B4 八台工業級 SLA 3D 列印設備的最新狀態與監控資訊。",
    features: ["3D 機台監控", "設備燈號", "即時狀態"],
    href: "/realtime",
    icon: "machine",
  },
  {
    title: "歷史分析",
    english: "HISTORICAL ANALYTICS",
    description: "分析每日、每週及每月加工時間比例、歷史趨勢、異常事件與跨期間變化。",
    features: ["加工時間分析", "歷史趨勢", "異常事件"],
    href: "/analytics",
    icon: "chart",
  },
  {
    title: "資料管理",
    english: "DATA MANAGEMENT",
    description: "匯入谷林歷史 Excel、檢查資料品質，並管理即時 API 連線設定。",
    features: ["Excel 匯入", "資料品質", "API 設定"],
    href: "/data/import",
    icon: "database",
  },
];

export default function Home() {
  return (
    <div className="landing-shell">
      <a className="skip-link" href="#landing-content">跳至工作區入口</a>
      <header className="landing-header">
        <Brand subtitle="SMART EQUIPMENT PLATFORM" subtitleLang="en" />
        <p className="landing-partner">谷林運算 <span>×</span> 極印快速成型</p>
      </header>
      <main id="landing-content" className="landing-main" tabIndex={-1}>
        <div className="landing-intro">
          <p className="landing-eyebrow" lang="en">INDUSTRIAL MONITORING PLATFORM</p>
          <h1>極印智慧設備監控平台</h1>
          <p className="landing-description">整合即時設備監控、歷史稼動分析與資料管理</p>
          <p className="landing-guide">請選擇工作區，開始探索設備數據。</p>
        </div>
        <section className="workspace-entry-section" aria-labelledby="workspace-entry-title">
          <h2 id="workspace-entry-title" className="landing-section-title">選擇工作區</h2>
          <div className="workspace-entry-grid">
            {workspaces.map((workspace, index) => (
              <Link key={workspace.href} href={workspace.href} className="workspace-entry-card" aria-labelledby={`workspace-title-${index}`} aria-describedby={`workspace-description-${index} landing-data-note`}>
                <div className="workspace-card-top">
                  <span className="workspace-card-icon"><Icon name={workspace.icon} size={27} /></span>
                  <span className="workspace-card-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                </div>
                <h3 id={`workspace-title-${index}`}>{workspace.title}</h3>
                <p className="workspace-card-english" lang="en">{workspace.english}</p>
                <p id={`workspace-description-${index}`} className="workspace-card-description">{workspace.description}</p>
                <ul className="workspace-features">{workspace.features.map((feature) => <li key={feature}>{feature}</li>)}</ul>
                <div className="workspace-card-bottom"><span>進入工作區</span><Icon name="arrowUpRight" size={19} className="workspace-card-arrow" /></div>
              </Link>
            ))}
          </div>
        </section>
        <div className="landing-preview-note" role="note">
          <Icon name="info" size={15} />
          <p id="landing-data-note">介面預覽：即時 API 尚未連線，歷史資料尚未匯入；3D 與匯入功能尚未開放。</p>
        </div>
      </main>
      <footer className="landing-footer" lang="en">JYIN EQUIPMENT MONITORING SYSTEM · 2026</footer>
    </div>
  );
}

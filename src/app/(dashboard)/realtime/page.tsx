import type { Metadata } from "next";
import Link from "next/link";
import { EquipmentOverview } from "@/components/realtime/equipment-overview";
import { Badge, Notice, PageHeading } from "@/components/ui/dashboard";
import { Icon } from "@/components/ui/icon";

export const metadata: Metadata = { title: "設備即時監控中心" };

export default function RealtimePage() {
  return <>
    <PageHeading eyebrow="即時監控 / 設備總覽" title="設備即時監控中心" description="集中掌握 A、B 區八台 SLA 3D 列印設備的最新狀態。" action={<Link className="button button-outline" href="/settings/api"><Icon name="link" size={16} />設定資料連線<Icon name="arrow" size={15} /></Link>} />
    <section className="connection-strip" aria-label="資料來源與連線狀態"><div className="connection-source"><span className="connection-icon"><Icon name="disconnected" size={22} /></span><div><strong>等待接入設備資料</strong><p>資料來源：谷林即時 API（尚未串接）</p></div></div><div className="connection-facts"><div><span>連線狀態</span><Badge tone="unknown" dot>尚未連線</Badge></div><div><span>最新資料時間</span><strong>—</strong></div><div><span>設備範圍</span><strong>A1–A4 / B1–B4</strong></div></div></section>
    <EquipmentOverview />
    <Notice title="狀態判讀說明">尚未連線與未知狀態不等於未開機。黃燈僅代表待機／完成，無法只憑燈號區分；本頁未使用歷史或模擬數據作為即時狀態。</Notice>
  </>;
}

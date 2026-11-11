import type { Metadata } from "next";
import { AnalysisFilters } from "@/components/ui/analysis-filters";
import { Badge, ChartPlaceholder, EmptyState, MetricCard, Notice, PageHeading, Panel } from "@/components/ui/dashboard";

export const metadata: Metadata = { title: "歷史稼動率分析" };

export default function AnalyticsPage() {
  return <>
    <PageHeading eyebrow="歷史分析 / 加工時間比例" title="歷史稼動率分析" description="依歷史觀測時間，檢視設備加工分布與跨期間變化。" action={<Badge>歷史資料 · 尚未匯入</Badge>} />
    <AnalysisFilters />
    <div className="metrics-grid"><MetricCard label="加工時間" icon="clock" tone="green" hint="Green · 單位：小時" /><MetricCard label="待機／完成時間" icon="clock" tone="yellow" hint="Yellow · 單位：小時" /><MetricCard label="異常時間" icon="event" tone="red" hint="Red · 單位：小時" /><MetricCard label="未開機時間" icon="clock" tone="gray" hint="None · 單位：小時" /></div>
    <div className="two-column"><Panel title="各機台加工比例排行" description="以符合品質條件的歷史紀錄比較" aside={<Badge>圖表預留</Badge>}><ChartPlaceholder title="尚無加工比例資料" description="每日歷史資料匯入後，將呈現八台設備排行。" kind="ranking" /></Panel><Panel title="歷史加工趨勢" description="依每日／每週／每月觀察變化" aside={<Badge>圖表預留</Badge>}><ChartPlaceholder title="尚無趨勢資料" description="目前未匯入歷史資料，無法產生趨勢圖。" /></Panel></div>
    <Panel title="跨期間比較" description="上期比較與同期比較"><div className="two-column comparison-grid"><div><h3>上期比較</h3><EmptyState compact title="尚無比較資料" description="待建立本期與上期的有效觀測區間。" icon="calendar" /></div><div><h3>同期比較</h3><EmptyState compact title="尚無比較資料" description="待匯入可比較的同期歷史資料。" icon="calendar" /></div></div></Panel>
    <Notice tone="brand" title="資料品質與指標定義"><p>全天加工比例＝Green ÷ 有效觀測時間；開機期間加工比例＝Green ÷（Green＋Yellow＋Red）。秒數 ÷ 3600 換算小時。分母為零、缺值或品質不合格時顯示「無法計算」，週、月比例須加總有效秒數後重算。</p><p>2026/10/21 八台設備累積時間接近 48 小時，保留原值、標記待核對，暫不納入正常分析。加工時間比例不等於 OEE 或實際產能效率；低比例仍需考慮排程與專機專用限制。</p></Notice>
  </>;
}

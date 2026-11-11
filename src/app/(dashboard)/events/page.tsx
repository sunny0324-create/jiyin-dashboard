import type { Metadata } from "next";
import { AnalysisFilters } from "@/components/ui/analysis-filters";
import { Badge, EmptyTable, MetricCard, Notice, PageHeading, Panel } from "@/components/ui/dashboard";

export const metadata: Metadata = { title: "異常事件分析" };

export default function EventsPage() {
  return <>
    <PageHeading eyebrow="歷史分析 / 事件紀錄" title="異常事件分析" description="依事件語意分類，追溯設備通知、環境警示與待核對事件。" action={<Badge>歷史事件 · 尚未匯入</Badge>} />
    <div className="metrics-grid"><MetricCard label="事件總數" icon="file" /><MetricCard label="加工完成通知" icon="machine" /><MetricCard label="環境警示" icon="environment" /><MetricCard label="其他待分類事件" icon="event" /></div>
    <AnalysisFilters events />
    <Panel title="事件清單" description="保留原始事件、來源、時間及分類規則" aside={<Badge>尚無資料</Badge>}><EmptyTable caption="歷史事件清單" columns={["事件時間", "區域 / 設備", "事件類別", "原始事件", "資料來源", "分類規則"]} title="尚無事件紀錄" description="事件資料匯入後，將在此顯示可追溯的分類紀錄。" /></Panel>
    <Notice title="Alarm 不等於設備故障">事件將區分加工完成通知、環境警示及其他待分類事件；不直接將感測器狀態代碼判定為紅燈故障。</Notice>
  </>;
}

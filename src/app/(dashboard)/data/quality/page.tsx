import type { Metadata } from "next";
import { Badge, EmptyTable, MetricCard, Notice, PageHeading, Panel } from "@/components/ui/dashboard";

export const metadata: Metadata = { title: "資料品質管理" };

export default function QualityPage() {
  return <>
    <PageHeading eyebrow="資料管理 / 品質檢核" title="資料品質管理" description="追蹤資料完整性、重複與異常，讓每一項分析都有可靠依據。" action={<Badge>品質檢核 · 尚無資料</Badge>} />
    <div className="metrics-grid"><MetricCard label="已檢查紀錄" icon="database" hint="尚未匯入資料" /><MetricCard label="有效紀錄" icon="shield" hint="尚未執行品質檢核" /><MetricCard label="待核對紀錄" icon="event" hint="尚無檢核結果" /><MetricCard label="重複／不合格紀錄" icon="file" hint="尚無檢核結果" /></div>
    <Panel title="品質異常紀錄" description="顯示原始值、問題與處理狀態" aside={<Badge>尚無資料</Badge>}><EmptyTable caption="資料品質異常紀錄" columns={["資料日期", "設備", "品質問題", "原始值", "來源批次", "處理狀態"]} title="尚無品質檢核紀錄" description="尚未匯入資料，不代表所有資料均已通過檢核。" /></Panel>
    <Panel title="品質狀態說明" description="後續匯入與計算將依此區分"><div className="quality-definitions"><div><span className="quality-marker quality-valid" /><h3>有效</h3><p>符合已確認的欄位、單位、粒度與品質規則，可納入分析。</p></div><div><span className="quality-marker quality-review" /><h3>待核對</h3><p>保留原始值，待企業確認；核對前不納入正常比例分析。</p></div><div><span className="quality-marker quality-invalid" /><h3>不合格／重複</h3><p>缺值、異常或重複紀錄須標記並排除，避免統計失真。</p></div><div><span className="quality-marker quality-pending" /><h3>未檢查</h3><p>尚未取得或驗證資料，不能判定為品質合格。</p></div></div></Panel>
    <Notice tone="brand" title="已知核對規則 · 非匯入結果">2026/10/21 八台設備的燈號累積時間接近 48 小時；未來匯入時須保留原值、標記待核對並暫時排除。Blue、White 非零值亦應標記異常，不參與正常統計。</Notice>
  </>;
}

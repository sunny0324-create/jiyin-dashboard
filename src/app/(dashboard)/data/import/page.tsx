import type { Metadata } from "next";
import { Badge, EmptyTable, Notice, PageHeading, Panel, UnavailableButton } from "@/components/ui/dashboard";
import { Icon } from "@/components/ui/icon";

export const metadata: Metadata = { title: "Excel 資料匯入" };

export default function ImportPage() {
  return <>
    <PageHeading eyebrow="資料管理 / 歷史資料" title="Excel 資料匯入" description="整合谷林匯出的每日歷史紀錄，建立可追溯的分析資料。" action={<Badge>匯入功能 · 尚未開放</Badge>} />
    <div className="import-layout"><Panel title="上傳歷史資料" description="管理者匯入工作區"><div className="upload-zone" aria-label="Excel 上傳預留區，尚未開放"><span className="upload-icon"><Icon name="upload" size={32} /></span><h3>Excel 檔案上傳區</h3><p>上傳功能尚未開放，目前無法選擇或拖曳檔案。</p><UnavailableButton label="選擇 Excel 檔案" /><span className="upload-format">規劃格式：.xlsx · 谷林每日歷史資料</span></div></Panel><Panel title="支援格式與資料要求" description="第一版匯入範圍"><ul className="requirement-list"><li><Icon name="file" /><div><strong>谷林官網匯出 Excel</strong><p>優先支援目前已驗證的每日歷史資料格式。</p></div></li><li><Icon name="machine" /><div><strong>每台設備、每日一筆</strong><p>設備範圍 A1～A4、B1～B4；累積時間單位為秒。</p></div></li><li><Icon name="shield" /><div><strong>原始資料完整留存</strong><p>保留資料來源、匯入批次與品質標記，不覆寫企業原值。</p></div></li></ul></Panel></div>
    <Panel title="匯入流程" description="預定流程說明，尚未啟用"><ol className="import-steps">{[{ title: "選擇檔案", text: "確認來源與每日資料格式" }, { title: "檢查資料", text: "欄位、設備、日期與粒度" }, { title: "預覽與核對", text: "提示缺值、重複與異常" }, { title: "確認匯入", text: "保留批次，防止重複計算" }].map((step, index) => <li key={step.title}><span>{String(index + 1).padStart(2, "0")}</span><div><h3>{step.title}</h3><p>{step.text}</p></div></li>)}</ol></Panel>
    <Panel title="匯入紀錄" description="批次與來源追蹤" aside={<Badge>尚無紀錄</Badge>}><EmptyTable caption="Excel 匯入批次紀錄" columns={["匯入時間", "來源檔案", "資料期間", "資料筆數", "品質狀態", "批次識別"]} title="尚無匯入紀錄" description="匯入功能開放後，將在此顯示每次匯入的批次資訊。" /></Panel>
    <Notice title="避免統計重複">相同紀錄重複匯入不得造成統計加倍；每日、每週與每月等不同粒度資料，不得直接重複加總。</Notice>
  </>;
}

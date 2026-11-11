import type { Metadata } from "next";
import { Badge, ChartPlaceholder, Notice, PageHeading, Panel } from "@/components/ui/dashboard";
import { Icon } from "@/components/ui/icon";

export const metadata: Metadata = { title: "環境監測" };

export default function EnvironmentPage() {
  return <>
    <PageHeading eyebrow="歷史分析 / 作業環境" title="環境監測" description="分區檢視歷史溫濕度與環境警示，掌握設備作業環境。" action={<Badge>歷史資料 · 尚未匯入</Badge>} />
    <div className="two-column">{["A", "B"].map((area) => <Panel key={area} title={`${area} 區環境資料`} description="來源：歷史環境資料" aside={<Badge>尚無資料</Badge>}><div className="environment-readings"><div><Icon name="environment" /><span>溫度</span><strong>— <small>°C</small></strong></div><div><Icon name="layers" /><span>濕度</span><strong>— <small>% RH</small></strong></div></div><div className="panel-footnote">資料時間 — · 尚未匯入，非即時讀值</div></Panel>)}</div>
    <div className="two-column"><Panel title="溫度歷史趨勢" description="A、B 區溫度變化 · °C" aside={<Badge>圖表預留</Badge>}><ChartPlaceholder title="尚無溫度資料" description="匯入已驗證的環境資料後呈現歷史趨勢。" /></Panel><Panel title="濕度歷史趨勢" description="A、B 區相對濕度變化 · % RH" aside={<Badge>圖表預留</Badge>}><ChartPlaceholder title="尚無濕度資料" description="目前沒有環境觀測資料可供分析。" /></Panel></div>
    <Notice title="環境警示 · 尚無資料">尚無環境紀錄，無法判定環境是否正常。警示門檻與感測器代碼須依已確認規則解讀，不自動視為機台故障。</Notice>
  </>;
}

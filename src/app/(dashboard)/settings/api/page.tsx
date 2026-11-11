import type { Metadata } from "next";
import { Badge, EmptyTable, Notice, PageHeading, Panel, UnavailableButton } from "@/components/ui/dashboard";
import { Icon } from "@/components/ui/icon";

export const metadata: Metadata = { title: "API 連線設定" };

export default function ApiSettingsPage() {
  return <>
    <PageHeading eyebrow="資料管理 / 連線管理" title="API 連線設定" description="集中管理谷林設備資料來源，安全接入即時監控。" action={<Badge tone="unknown" dot>尚未設定</Badge>} />
    <section className="connection-strip"><div className="connection-source"><span className="connection-icon"><Icon name="disconnected" size={23} /></span><div><strong>尚未建立 API 連線</strong><p>目前為介面預覽，不會發出設備 API 請求。</p></div></div><Badge tone="unknown" dot>設備狀態未知</Badge></section>
    <div className="two-column"><Panel title="API 網址管理" description="後續由管理者透過後端安全更新" aside={<Badge>預留介面</Badge>}><div className="settings-form"><label htmlFor="api-address">API 服務網址</label><input id="api-address" type="text" placeholder="尚未設定，管理功能尚未開放" disabled /><p>目前無法輸入或儲存。正式連線資訊將由後端管理。</p><div className="settings-info-row"><span>允許連線主機</span><strong>尚未設定</strong></div><div className="settings-info-row"><span>固定出口 IP 白名單</span><strong>待企業確認</strong></div><UnavailableButton label="儲存連線設定" /></div></Panel><Panel title="連線測試" description="驗證服務可用性與資料時間" aside={<Badge>預留介面</Badge>}><div className="settings-form"><dl className="detail-list"><div><dt>連線狀態</dt><dd>尚未連線</dd></div><div><dt>最近測試時間</dt><dd>—</dd></div><div><dt>最新資料時間</dt><dd>—</dd></div><div><dt>資料過期判定規則</dt><dd>待確認</dd></div></dl><p>尚未執行任何連線測試，無法判定服務或設備是否正常。</p><UnavailableButton label="測試 API 連線" /></div></Panel></div>
    <Notice title="安全與連線原則">敏感網址、Token 與金鑰不得暴露於前端或 Git。後續後端須驗證管理者權限、限制允許連線主機並防範 SSRF。網址變更規則與固定出口 IP 要求仍待確認。</Notice>
    <Panel title="連線紀錄" description="測試與連線異常追蹤" aside={<Badge>尚無紀錄</Badge>}><EmptyTable caption="API 連線紀錄" columns={["時間", "操作", "連線結果", "資料時間", "說明"]} title="尚無連線紀錄" description="連線功能開放後，將在此保留測試及異常紀錄。" /></Panel>
  </>;
}

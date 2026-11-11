# 谷林運算即時 API 後端基礎架構

本階段僅建立伺服器端連線條件控制。首頁、七個工作區、即時監控畫面及既有互動均未串接此介面，不會自動輪詢廠商 API。

## 模組與資料流

- src/lib/gulin/config.ts：讀取伺服器環境變數，限制 HTTPS 來源、連接埠與三個固定資源路徑。
- src/lib/gulin/access-window.ts：可獨立測試的台灣時間判斷。
- src/lib/gulin/client.ts：統一 GET、10 秒逾時、2 MiB 回應上限、轉址拒絕與錯誤分類。
- src/lib/gulin/validation.ts：JSON 解析、根節點物件／陣列檢查、有限數值及巢狀深度檢查。
- src/lib/gulin/types.ts、errors.ts：原始 JSON 型別、統一狀態、繁體中文訊息及 HTTP 對應。
- src/lib/gulin/handler.ts：存取驗證、參數驗證、client 呼叫及最小回傳物件。
- src/app/api/gulin/route.ts：Node.js Runtime 的動態 Route Handler。

流程為：內部呼叫授權 → 固定資源驗證 → 台灣時間檢查 → 伺服器端點設定驗證 → 發送前再次檢查時間 → GET → JSON 基礎檢查 → 接收結果。

## 環境變數

專案根目錄 .env.local 已由 .gitignore 排除，禁止提交。沒有 NEXT_PUBLIC_ 變數，也不在正式程式硬編碼企業端點。

| 變數 | 用途 |
| --- | --- |
| GULIN_VALUES_URL | 廠商確認的 values HTTPS 端點 |
| GULIN_GROUPS_URL | 廠商確認的 groups HTTPS 端點 |
| GULIN_CONFIGS_URL | 廠商確認的 configs HTTPS 端點 |
| GULIN_ALLOWED_ORIGIN | 明確允許的 HTTPS origin，包含必要連接埠，不含路徑 |
| GULIN_INTERNAL_TOKEN | 本站內部呼叫憑證，至少 32 字元；與廠商 API 認證無關 |

.env.example 僅提供空白端點與無效範例主機。管理者須從可信來源確認 origin，不能依請求參數產生允許清單。主機、連接埠或路徑不符時拒絕連線，不跟隨 3xx。此階段僅能由受信任的伺服器設定更新環境變數；尚未建立管理介面。

本機建立的內部憑證使用 32 個隨機位元組產生，不輸出至日誌。正式部署應透過部署平台的機密管理設定；不得放進前端程式、瀏覽器儲存空間或 Git。修改環境變數後須重新啟動 Next.js。

## 內部路由與存取控制

GET /api/gulin?resource=values

resource 可為 values、groups、configs，省略時為 values。拒絕重複參數、自訂 URL 及其他參數。HEAD 明確回應 405，不委派 GET；其他不支援方法由 Next.js 回應 405。

呼叫端必須在 Authorization 標頭帶入 Bearer 加上 GULIN_INTERNAL_TOKEN 的值。這是本站內部介面的保護，廠商請求不會收到此標頭。未設定憑證時回應 503；憑證不符時回應 401，不觸發上游請求。雜湊後以固定長度進行 timingSafeEqual 比較。

此版本只供受信任的伺服器或管理者工具呼叫。未來前端串接前，須整合伺服器驗證的使用者 Session 與讀取權限，不能把內部憑證交給瀏覽器。本次不建立登入系統，也不開放跨來源 CORS。

所有自訂回應均使用 private, no-store 與 Vary: Authorization；上游 fetch 亦使用 no-store，沒有自動重試或輪詢。

## 時段與設備狀態

以伺服器 Date 的絕對時間，經 Intl.DateTimeFormat 明確指定 Asia/Taipei 轉換。每日允許區間為 [09:00:00, 17:00:00)，含週末；不依賴程序預設時區、瀏覽器時間或請求的 Date 標頭。

非開放時段回應 HTTP 503、status 為 outside_access_window，不讀取上游。設定讀取前及實際送出前各檢查一次。17:00 前已開始的請求仍可在既定 10 秒期限內完成；逾時範圍包含本文串流讀取。

outside_access_window、TLS 失敗、網路失敗等均表示無法取得資料，不得對應為機台故障或未開機。

## 原始 JSON 與後續轉換

Client 的成功結果包含 raw，只代表根節點為物件／陣列且 JSON 基本結構合法，沒有強制轉型為完整設備資料。尚未確認廠商 responseCode、感測器 status、機台對應、燈號語意、時間格式及資料過期規則。

Route Handler 暫不公開原始 payload，避免其中夾帶內部網址或尚未確認的敏感欄位。HTTP 200 回應形狀如下；receivedAt 為本次接收時間，不是感測器更新時間：

~~~json
{
  "ok": true,
  "status": "received_unvalidated",
  "resource": "values",
  "receivedAt": "伺服器接收時間（ISO 8601）",
  "data": null,
  "validation": "raw_json_only",
  "equipmentState": "unknown",
  "message": "已收到 JSON，尚未完成資料語意、機台對應及新鮮度驗證。",
  "accessWindow": {
    "timeZone": "Asia/Taipei",
    "opensAt": "09:00:00",
    "closesAt": "17:00:00"
  }
}
~~~

後續須以企業確認的實際樣本擴充 validation.ts，明確驗證每種資源與業務回應碼，再增加可公開的 DTO 轉換。原始值、來源時間與轉換規則應可追溯；成功解析 JSON 不代表設備在線或資料足夠新。

## 錯誤與 TLS

| 狀態 | HTTP |
| --- | --- |
| outside_access_window、configuration_error | 503 |
| unauthorized | 401 |
| invalid_request | 400 |
| connection_timeout | 504 |
| tls_certificate_error、network_error、upstream_http_error、upstream_redirect | 502 |
| invalid_content_type、invalid_json、invalid_payload、response_too_large | 502 |
| internal_error | 500 |

憑證自簽、鏈不受信任、過期與主機名稱不符等錯誤會從 fetch 的 cause 或 AggregateError 中辨識。不回傳例外堆疊、上游錯誤文字、原始錯誤本文、Location 或 URL；僅在 HTTP 錯誤中保留數字 upstreamStatus。

程式不設定不安全的 Agent、dispatcher 或全域 TLS 變數，也沒有略過驗證的模式。目前廠商憑證問題未修復，正式連線可能回應 tls_certificate_error，這是預期的安全阻擋。

後續可由廠商提供受信任 HTTPS 網域及完整憑證鏈，或在核對企業 CA 的 SHA-256 指紋後，由部署環境使用 Node.js 的 NODE_EXTRA_CA_CERTS 指定 PEM 信任憑證。若可信 CA 已安裝於 Windows，可評估 NODE_USE_SYSTEM_CA；兩者均須在 Node.js 啟動前設定，不能只寫入由 Next.js 稍後載入的 .env.local 就假設生效。

新增信任不能修復 SAN 與 IP／網域不符、過期或用途錯誤，仍須驗證名稱及有效期限。本次未安裝任何 CA、設定上述變數或改動作業系統信任存放區。

## 離線測試

~~~sh
npm run test:gulin
npm run lint
node node_modules/typescript/bin/tsc --noEmit --incremental false
npm run build
~~~

使用已安裝的 Node.js v24 內建測試器與 TypeScript，不新增依賴。tests/register.mjs 僅於測試程序載入，解析 TypeScript 與 Next.js 的 server-only 標記，並把預設 fetch 設為禁止網路。測試不載入 .env.local，使用保留的 .invalid 範例主機、注入時鐘及模擬 transport，不觸及廠商 API。

涵蓋時段邊界、跨日與週末、設定錯誤、允許來源與固定路徑、轉址阻擋、內容格式與大小、連線及本文逾時、TLS 分類、內部授權、錯誤狀態碼、快取標頭及原始資料不外洩。

## 下一步真實連線驗證

1. 請廠商提供正式主機名稱、含 SAN 的伺服器憑證、完整中繼鏈、必要的根 CA 公開憑證、可信管道的 SHA-256 指紋與憑證更新方式；不需要私密金鑰。
2. 確認部署主機的出口 IP 白名單與台灣時間開放條件。不要把本機白名單視為所有部署環境皆可連線。
3. 經確認後修復伺服器憑證或設定可信 CA，保持正常憑證、名稱與有效期驗證，重新啟動 Node.js。
4. 在台灣時間 09:00～17:00，優先使用下方本機命令列診斷工具，先單次測試 values，再分別單次測試 groups 與 configs。CLI 直接重用 Client，不需要複製內部 Bearer 憑證。若另行驗證 /api/gulin 路由，仍須使用伺服器端內部授權；不把憑證貼進瀏覽器、網址或日誌。
5. 確認接收結果後，另行取得及審核實際 JSON 樣本，完成 schema、資料時間與機台對應，再接前端。勿以 received_unvalidated 宣稱即時連線正常。

## 本機單次診斷工具（STEP 5-3A）

此工具僅供具備工作目錄與伺服器設定讀取權限的開發人員使用，不新增公開 API，也不改動既有路由的 Bearer 驗證。使用 Node.js v24.22.0 及已安裝的 TypeScript、Next.js 相依套件，不需安裝新套件。

### 執行方式

先在專案根目錄執行預檢；不會建立任何對外連線：

~~~sh
npm run diagnose:gulin -- --help
npm run diagnose:gulin -- --resource values
~~~

預檢只驗證本機端點設定、TLS 是否遭停用及目前台灣時間。requestsMade 為 0，tlsTrust 為 not_tested；不代表已驗證遠端憑證或已取得真實資料。

取得廠商確認的信任設定後，於台灣時間 09:00（含）至 17:00（不含）手動執行。以下三個指令須逐次執行，每個指令至多發出一次 GET；任一 TLS 錯誤應先處理，再決定是否繼續：

~~~sh
npm run diagnose:gulin -- --resource values --execute
npm run diagnose:gulin -- --resource groups --execute
npm run diagnose:gulin -- --resource configs --execute
~~~

不加 --execute 只做預檢；不指定資源僅顯示說明。沒有 all、輪詢、重試、任意 URL 或原始資料輸出選項。不需啟動 Next.js，也不需要輸入內部 Token。非開放時段即使加上 --execute，也由既有 Client 阻擋，不會連線。

CLI 以 @next/env 載入專案根目錄的環境設定並抑制載入訊息，使用 scripts/register-typescript.mjs 在本機載入既有 TypeScript 模組。此載入器也由離線測試共用，不加入正式 Next.js 執行流程；原有測試的禁止真實 fetch 保護仍保留。

### 輸出與遮蔽

- httpStatus 是本次收到的廠商 HTTP 狀態；TLS／連線失敗或根本未發送時為 null，不以內部路由的 HTTP 502 代替。
- responseFormat 僅為 json、not_json 或 missing，不回顯原始標頭。jsonValid 為 true、false 或 null；null 表示沒有執行或無法完成 JSON 檢查。
- 成功時保留 received_unvalidated，顯示 JSON 根型別、固定允許的欄位名稱、結構抽樣與可確認的計數。未知欄位名稱、動態識別碼、全部原始值均省略／遮蔽，包含原始數字及時間，不輸出原始 JSON。
- 結構摘要最多四層深度、80 個節點；陣列只抽樣第一項，動態對照表只抽樣兩筆，一般物件最多十六個欄位。頂層名稱最多列三十二個，其餘可由總欄位數判斷。
- values 的 data 必須是每筆 ID 與鍵一致且具有 values 物件的對照表，才計感測器紀錄數。configs 必須進一步具備 config.id、displayname、type、unit；groups 必須具備 groupId、groupAlias、sensors，才分別計群組紀錄數及不重複 ID 數。
- 不符合上述結構或空集合時，confirmedCounts 為 null，僅顯示一般欄位／項目數，不推定感測器為零。這些條件不是完整業務 schema，也不能把計數視為八台機台、在線設備數或設備狀態。
- 沒有檔案輸出功能，不記錄 URL、Bearer、例外堆疊、原始錯誤頁或 Location。請勿另加原始回應的 console.log 或自行將真實資料寫入 Git 追蹤檔案。

程序退出碼：0 為說明、有效預檢或成功接收；1 為讀取被阻擋或失敗；2 為參數、設定或工具錯誤。預檢成功不能當作真實 API 測試成功。

### TLS 問題的正式處理

目前已知遠端有憑證信任問題，本次沒有重新連線，也沒有證據顯示問題已排除。真實資料驗證仍受此條件阻擋，不會略過驗證以取得資料。

請先向廠商確認以下公開資訊，不需要私密金鑰：

1. 授權的根 CA 公開憑證（PEM）、完整中繼鏈、伺服器公開憑證，以及由獨立可信管道確認的 SHA-256 指紋；釐清是自簽伺服器憑證還是企業 CA 簽發。
2. 正式連線使用 IP 或網域；若使用 IP，SAN 必須有對應的 iPAddress 項目。僅在 Subject／CN 寫網域，不能保證 IP 驗證成功。若改用正式 HTTPS 網域，請提供其 DNS、連接埠、SNI 與完整鏈設定。
3. 憑證有效期限、伺服器驗證用途及更新／輪替流程；伺服器應送出正確中繼鏈。
4. 本機與未來部署環境各自的固定出口 IP 白名單、開放時段、可接受讀取頻率。
5. JSON envelope、業務回應碼、感測器與 A1～A4／B1～B4 對應、燈號欄位語意、時間格式／時區、更新頻率及資料過期規則。

取得憑證後可先離線檢查 Subject、Issuer、SAN、有效期限與指紋，例如使用已安裝的 OpenSSL x509 對廠商提供的公開憑證檔執行 -subject、-issuer、-dates、-fingerprint -sha256、-ext subjectAltName，以及 -checkip 對照目前核准的 API IP。此步不連線，但也不能證明遠端當下提供的鏈與文件一致；須於經確認的真實測試再驗證。

CA 信任設定須另經確認後執行，本次未自動設定：

- NODE_EXTRA_CA_CERTS：在 Node.js 啟動前指定已核對來源與指紋的 PEM。不能將未確認的連線端憑證直接升級成信任根；檔案請放在 Git 追蹤範圍外。
- NODE_USE_SYSTEM_CA=1 或 --use-system-ca：僅在 Windows 信任存放區已安裝並核對該可信 CA 時使用。本機的 Node.js v24.22.0 支援此方式；不代表目前系統已信任廠商。
- 兩者都保留憑證驗證；無法修復 SAN／IP 不符、過期、用途或伺服器鏈設定錯誤。不要只在 .env.local 填入 Node 啟動設定，就宣稱目前程序已載入 CA。
- CLI 若偵測到停用 TLS 驗證的程序設定會拒絕執行。若收到 tls_certificate_error，報告的 tlsTrust 為 blocked、httpStatus 為 null，沒有結構摘要；請先修復信任／名稱問題再重測。

官方依據：[Node.js CA 啟動設定](https://nodejs.org/api/cli.html#node_extra_ca_certsfile)、[系統 CA 設定](https://nodejs.org/api/cli.html#node_use_system_ca1)、[主機名稱驗證](https://nodejs.org/api/tls.html#tlscheckserveridentityhostname-cert)。

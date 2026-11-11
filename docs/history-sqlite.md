# 本機歷史 SQLite 資料庫

本服務沿用既有六表 Excel 解析器，只在明確執行 CLI 或呼叫匯入服務時寫入 SQLite。沒有修改頁面、公開 API、即時 API 或正式建置流程。使用 Node.js v24.22.0 原生 `node:sqlite`（本機 SQLite 3.53.4），沒有新增套件；現有 Node 20 型別未涵蓋 SQLite，因此在 native.ts 只宣告實際使用的原生介面。

## 本機使用

在專案根目錄執行；Windows PowerShell 若限制 npm.ps1，使用 npm.cmd。

~~~powershell
npm.cmd run import:history
npm.cmd run import:history -- --file "data/samples/極印_三分鐘標準化資料_2026-10-01.xlsx"
npm.cmd run import:history -- --list
npm.cmd run import:history -- --file "其他本機檔案.xlsx" --database "data/local/另一份.sqlite"
~~~

預設資料庫 `data/local/jiyin-history.sqlite`。資料庫只能建立在工作目錄下的 data/local/，不接受符號連結或 junction 路徑，也不接受 public/ 或工作區外路徑。服務本身沒有前端路由，不傳出完整企業原始資料。data/ 已整個被 .gitignore 排除，涵蓋 Excel、SQLite、WAL、SHM 與獨立測試資料庫；沒有修改 .gitignore。

CLI 回傳 0 代表成功持久保存或辨識既有批次，**不代表資料品質通過**。衝突、結構不合約或交易失敗回傳 1；無法讀取來源、無法開啟資料庫或參數不合法回傳 2。列出批次只提供檔名、雜湊、日期、版本與品質摘要，不輸出原始儲存格。資料庫尚不存在時，--list 會建立空資料庫結構，但不匯入企業資料。

## 可重用介面

~~~typescript
import { openHistoryDatabase } from "@/lib/history/sqlite/database";
import { SqliteHistoryImporter, listImportBatches } from "@/lib/history/sqlite/importer";

const db = openHistoryDatabase();
try {
  const result = await new SqliteHistoryImporter(db).importFile(localExcelPath);
  // result.status: imported 或 already_imported
  // result.counts / result.quality：來源筆數、可分析列數及驗證摘要
  const batches = listImportBatches(db);
} finally {
  db.close();
}
~~~

SqliteHistoryImporter 亦實作既有 HistoryImportPort.importBatch，供可信任的伺服器端解析結果重用；外部輸入必須先經既有解析器，不能自行拼接 ParsedHistory 冒充已驗證資料。上述模組為 server-only，不可從 Client Component 匯入。匯入與查詢均為明確操作，模組載入與 Next.js Build 不會建立資料庫或自動匯入。原生 DatabaseSync 會同步執行 SQL，適用目前單機、少量管理者的 MVP；大型檔案及多使用者匯入日後應移至工作程序。

## 資料表與追溯關係

所有資料表採 STRICT 模式，SQL 使用預備語句與綁定參數，開啟 foreign_keys、WAL、synchronous=FULL、5 秒鎖定等待。application_id 與 user_version 識別本專案與 schema v1；不會覆寫未知或不相容版本的資料庫。

| 資料表 | 保存內容與限制 |
| --- | --- |
| import_batches | UUID 主鍵、檔名／位元組／SHA-256 UNIQUE、來源日期、180 秒粒度、解析規則版本、匯入時間、系統驗證摘要、完整 contract JSON（含上游宣告雜湊及時區確認限制） |
| excel_sheets | 每批六張表的原始表頭 JSON；複合主鍵 batch_id/name，包含沒有資料列的工作表 |
| raw_excel_rows | 原始列值 JSON、數字詞彙 lexeme、來源工作表及 Excel 列號；UNIQUE(batch_id,sheet_name,row_number)；表頭另外保存，不計入資料列數 |
| machine_3min | 原始列外鍵、來源日期／標籤、正規化起迄、設備／區域、六態 nullable 秒數、來源小時及比例、來源品質與備註、系統驗證狀態、analysis_eligible |
| environment_3min | 原始列外鍵、來源日期及起迄、區域／感測器編號／類別、實際 AVG/MAX/MED/MIN、°C 或 %RH、暫定門檻、來源判斷、來源品質及系統驗證狀態 |
| alarm_events | 原始列外鍵、秒級事件時間、所有來源欄位、來源分類與分類狀態、正規化分類、事件內容指紋及系統驗證狀態 |
| quality_issues | 來源品質表的原始列外鍵、日期／時間、對象、原因、nullable 合計秒數；不與系統驗證問題混用 |
| quality_issue_machine_links | 來源品質問題與對應機台列的多對多關聯；複合外鍵限制只能連到同一批次 |
| validation_issues | 規則代碼、嚴重程度、欄位、原因、來源工作表／列及相關列號；表頭／整表問題使用第1列，其他問題連結原始列 |

批次 → 工作表 → 原始列 → 正規化紀錄；複合外鍵同時核對 batch_id 和 sheet_name，避免指向錯誤來源。機台與環境的身分／來源日期／時間標籤／起迄、事件指紋與批次、品質及驗證代碼均建立查詢索引。

只建立三分鐘觀測表，grain_seconds 限定180。未來 machine_daily 必須獨立設計，不得把相同期間的每日與三分鐘資料直接相加。

## 匯入與衝突規則

1. 唯讀載入本機檔案，以同一份 bytes 計算 SHA-256 與解析，避免兩次讀檔不一致；不寫回 Excel。
2. 已存在相同 SHA 時回傳原批次，不新增任何列。新的檔案必須通過必要工作表、欄位及資料字典合約；列級品質問題完整保留，不阻止保存待核對資料。
3. 建立品質摘要，BEGIN IMMEDIATE 取得寫入鎖，鎖內再次檢查 SHA 與跨檔衝突。
4. 寫入批次、表頭、全部原始列、正規化紀錄、來源品質關聯及系統驗證問題，再 COMMIT。任一寫入失敗即 ROLLBACK 整批，既有資料不受影響。服務拒絕加入呼叫者已開啟的交易。
5. 跨檔同機台／同環境測點若來源日和時間標籤相同，或半開區間 [start,end) 重疊，整批拒絕；相鄰區間可共存。環境測點身分包含區域、感測器編號、類別，不以時間戳單獨判重。
6. Alarm 以正規化事件時間與所有保留的事件內容（含感測器識別）計算指紋，偵測跨檔完全相同事件。相同時刻不同感測器可共存；沒有企業唯一事件 ID 時，不宣稱能辨識內容已更動的同一事件，須向企業確認事件 ID／修訂規則。
7. 衝突回傳候選對數及最多10筆摘要（來源列、資料表、既有批次／紀錄 ID），不輸出完整原始資料、不靜默更新。count 是候選衝突配對數，不是新增事件數。來源檔內重複則沿用解析器：保留每筆原始列與問題標記，不去重、不自動合併。

若來源機台、環境測點或時間無法正規化，不猜測身分來合併；保留原始列與驗證標記，機台／環境列不可用於正式分析。此類列無法保證跨檔語意判重，相同 SHA 仍可阻擋重複匯入。正式分析應同時篩選 analysis_eligible 與期間 coverage；不要只看批次已存在或匯入成功。

## 品質與 NULL

六種燈號秒數全部為 nullable REAL，沒有補零或 COALESCE。缺少 Red 秒數不代表 Red=0。來源原值、來源品質、系統驗證及分析資格分開保存，不重新計算或覆寫來源比例；不建立 OEE 或加工效率判定。

目前真實樣本3840筆機台全部待核對，analysis_eligible 全部為0。環境參考門檻保存 threshold_provisional=1，超過26°C／40%RH不自動變成設備故障。13筆加工完成與20筆環境警示分別保存，沒有新增「故障」分類。24:00 保留 source_date，interval_end 為次日00:00；所有時間沿用字典 +08:00 慣例，其未另經廠商確認的限制保存在 contract_json。

## 測試與後續接線

~~~powershell
npm.cmd run test:history:sqlite
npm.cmd run test:history:sqlite:sample
npm.cmd run test:history
npm.cmd run test:history:sample
npm.cmd run test:gulin
npx.cmd tsc --noEmit
npm.cmd run lint
npm.cmd run build
~~~

一般 SQLite 測試使用明確標示的合成資料與記憶體資料庫；持久化及真實檔案測試另使用 data/local/sqlite-test-* 獨立目錄，關閉後檢查清理目標再移除。真實樣本測試缺檔直接失敗，不跳過或用合成檔冒充；測試不連線企業 API，也不碰預設本機資料庫。Rollback 測試以測試資料庫 TEMP TRIGGER 在寫入驗證問題時故障，確認整批資料回復。

下一步接 /data/import 時，先建立經管理者授權的伺服器端預覽與確認流程，重用同一份已驗證 bytes／雜湊，再交由本服務交易匯入；只回傳批次、筆數、品質與衝突摘要，不回傳完整原始資料。上傳大小／格式、檔名與本機路徑須由後端限制，不讓瀏覽器任意指定伺服器檔案路徑。尚未實作上傳 UI、公開匯入 API、背景工作或正式分析。

參考：[Node.js 24 原生 SQLite 文件](https://github.com/nodejs/node/blob/v24.x/doc/api/sqlite.md)、[SQLite 交易文件](https://www.sqlite.org/lang_transaction.html)。

# 三分鐘歷史 Excel 解析與驗證

此階段只讀取本機標準化 XLSX，依檔案內 data_dictionary 與 README 驗證，不連接谷林 API、不建立資料庫、不新增上傳功能、不修改任何現有頁面。原始企業資料放在已被 Git 排除的 data/；工具不寫回 Excel，也沒有將解析結果輸出到檔案的選項。

## 執行方式

~~~sh
npm run validate:history
npm run validate:history -- --file "本機標準化Excel路徑.xlsx"
npm run test:history
npm run test:history:sample
npm run test:gulin
~~~

第一個指令預設讀取使用者指定的 data/samples/極印_三分鐘標準化資料_2026-10-01.xlsx。缺檔明確失敗，不產生替代企業資料。test:history 使用記憶體內的合成單元測試資料；test:history:sample 明確要求本機真實樣本，缺檔會失敗，不會跳過或退回合成資料。離線測試沿用現有禁止真實 fetch 的載入設定。

驗證 CLI 只將欄位、型別、筆數、品質分布與有限錯誤摘要輸出到終端機。退出碼 0 表示已解析且通過本機檢查；1 表示可解析但有資料品質錯誤；2 表示檔案、結構、規格或參數無法處理。來源存在待核對列時回傳 1 是資料品質被正確阻擋，不是解析器崩潰。不得因展示需求將品質錯誤改成通過。

## 模組與依賴

| 模組 | 用途 |
| --- | --- |
| src/lib/history/reader.ts | 唯讀載入、原檔 SHA-256、ZIP／不支援儲存格前檢、原始表快照 |
| src/lib/history/schema.ts | 六張表頭與已人工審閱的關鍵字典規則，版本 three-minute-v1 |
| src/lib/history/time.ts | 嚴格日期、機台 ID、三分鐘時間標籤及跨日正規化 |
| src/lib/history/parser.ts | 字典及 README 合約、各類紀錄、重複、完整性與關聯驗證 |
| src/lib/history/types.ts | 原始值、正規化紀錄、來源座標、錯誤及未來匯入介面 |
| src/lib/history/summary.ts | 本機欄位型別、空值／零值、來源品質及驗證摘要 |
| scripts/validate-history.ts | 本機 CLI，不載入 API 設定、不發送請求 |

採用 read-excel-file 9.3.14 的 Node.js 唯讀介面，實測能直接讀取此檔案的 x: XML 命名空間前綴。初步實測 ExcelJS 4.4.0 無法解析此前綴，已移除，沒有為遷就套件而重寫來源檔。

fflate 0.8.3 已是解析套件相依項，另明列為直接依賴，用於唯讀容器前檢及建立合成測試 ZIP。前檢避免套件把公式快取或 Excel 錯誤當成普通數值／空白，並限制壓縮檔20 MiB、宣告解壓內容100 MiB。只接受已確認的 UTF-8 XML；此本機工具不是任意不可信上傳檔案的通用 Excel 服務。

原始文字以 trim: false 載入；數字另外保留 XML 數值詞彙 lexeme，再驗證為有限 number。沒有自行執行公式、寫入工作簿或將 numeric string 直接當數字的行為。公式及 Excel 錯誤目前明確拒絕，回報 ZIP 項目與儲存格，而不是假裝已完整解析其結果。

原始檔位元組才是完整 Excel 來源；rawSheets 是各欄位解析值的記憶體快照，不是原檔替代品，也不宣稱保留所有 Excel 版面及樣式。來源檔案 SHA-256 與 README 中上游原始檔的宣告 SHA-256 分開保存；未提供上游檔時，不宣稱已驗證其宣告雜湊。

參考：[read-excel-file 官方文件](https://github.com/catamphetamine/read-excel-file#readme)、[fflate 官方文件](https://github.com/101arrowz/fflate#readme)。

## 規格與原始值

完整保留六張工作表的表頭與資料列：machine_3min、environment_3min、alarm_events、quality_issues、data_dictionary、README。不可混用既有 machine_daily 概念，三分鐘資料也不直接加到每日彙總資料上。

必要欄位、工作表或關鍵字典定義不符時，保留原始快照但停止正規化，不推定新版本規則。欄位按名稱對應，可重排；缺少、重複或無法對應的必要欄位會報錯。README 的宣告筆數會與實際筆數比對。

每個正規化紀錄保留 sheet 與原始 Excel 列號；可由 rawSheets、source.sha256 追溯來源儲存格。錯誤包含規則代碼、嚴重程度、表、列、欄及必要的相關列號。重複資料只標記並保留全部來源列，不自動刪除、合併或覆寫。

空值保留 null；數值零仍為0。空白、NaN、無限值、非數值及負秒數不會補成0。資料日期、時間戳記、機台等只依已確認的格式正規化，原文仍在 rawSheets。尚未確認的 Excel 原生日期型別不默默猜測成文字日期；保留快照並標記型別錯誤。

## 時間與完整性

- 來源日每台機台480筆，每筆180秒，標籤為00:03至24:00。
- 日期欄保留來源日；24:00 的區間結束正規化為次日00:00，開始為來源日23:57。歸屬日必須依 sourceDate，而不是截取 intervalEnd 的日期。
- 機台與環境的起迄時間由來源文字正規化，再與字典的「結束標籤向前3分鐘」及180秒長度比對。遇到不一致不使用推算值覆寫來源。
- quality_issues 沒有起迄欄，其記憶體中的區間由來源日、結束標籤及字典規則推導，原始表仍維持五欄。
- 日期及秒級時間使用嚴格格式檢查，避免 JavaScript 將不存在的日期自動捲至次月。
- Asia/Taipei（+08:00）是字典描述的匯出標籤慣例，字典亦明示未另經平台確認。contract.timeZoneBasis 保存此限制；事件正規化亦使用檔案的時間慣例，原始事件文字保留，未宣稱已由廠商另行確認時區。
- 八台機台各檢查480個唯一格點；環境逐個實際觀測到的區域／感測器編號／類別檢查480格，並核對 README 的八個感測點及 A、B 區時間軸。不補造不存在的感測點或紀錄。

coverage 代表區間紀錄覆蓋完整性，與數值品質分開。即使時間完整，秒數缺漏或來源標示待核對仍不能用於正式分析。

## 機台品質與公式驗證

主要欄位包括日期、時間、起迄、機台、區域、六種燈號秒數、來源四態合計、小時、來源比例及品質註記。

1. 四個必要狀態為 None、Red、Yellow、Green；任一缺漏時不能驗證四態合計或加工比例。
2. Blue、White 值不補零，非零須標記並排除正常分析。六態存在缺值時無法驗證區間合計。
3. 六態合計品質容差依字典暫定為180秒±1秒，不重分配、不縮放來源秒數。
4. 來源四態合計為 None+Red+Yellow+Green；來源狀態小時應為秒數÷3600。
5. 只核對來源已提供的比例：區間比例為 Green÷四態合計；開機比例為 Green÷（Red+Yellow+Green）。來源品質須通過、秒數完整、分母大於0；分母為0時來源比例應留空，不能用0%代替。
6. 數字衍生欄比較採1e-6容差，以涵蓋來源小時顯示精度；區間合計邊界另有1e-8浮點容差。這些是驗證容差，不是資料修正。
7. 本階段不新增或輸出計算後的正式比例，只保留 sourceHours、sourceRatios。待核對來源即使提供比例，也保留並標記，不視為正式指標。
8. 重複、列級驗證錯誤、非零非設定燈號、來源非通過、或關聯的原始 quality_issues，均可使 eligibleForAnalysis 為 false。完整期間分析未來還必須核對 coverage。

加工比例不是 OEE；此階段不產生週月彙總或推論設備效率。

## 事件、環境與品質問題

Alarm 保留原始九欄及來源初步分類／分類狀態。事件時間維持秒級精度，不對齊三分鐘；持續時間原文保留，缺漏不推算為0。加工完成通知與環境／類比警示分開；其他一律待分類，不根據 red 或任何感測器狀態自動推論故障。

環境欄位包含區域、感測器編號、類別、AVG／MAX／MED／MIN、參考門檻、來源判斷與品質。溫度 °C、濕度 %RH 依已核對字典保存，統計值逐值保留，不重算中位數。檢查缺漏、型別、最小／最大及平均／中位數的相對順序。

26°C及40%RH 是字典的暫定參考門檻，並非企業正式品質規格；超過參考值不直接改成品質不合格或故障。thresholdProvisional 保持 true，來源品質與來源判斷分開。

quality_issues 的原始原因及可空合計逐列保留，與機台的來源日、標籤及 ID 關聯。未能對應者保留待核對。來源品質問題筆數、解析器規則標記數與 Alarm 事件數是不同概念；同一來源列可能產生多個驗證標記，不得把標記數當成新增企業事件。

## STEP 6-1 的 SQLite 設計建議

以下保留解析階段的設計依據。STEP 6-2 已在獨立的 src/lib/history/sqlite/ 實作本機資料庫與匯入服務；實際資料表、交易、跨檔拒絕策略及操作方式以 [history-sqlite.md](history-sqlite.md) 為準，沒有改寫解析器。

| 建議表 | 主要欄位及限制 |
| --- | --- |
| import_batches | id、source_filename、source_sha256 UNIQUE、upstream_source_sha256_claim、parser_rule_version、粒度、來源日期、匯入狀態 |
| raw_sheet_rows | batch_id、sheet_name、excel_row_number、原始欄位及數字詞彙 JSON；UNIQUE(batch_id,sheet_name,excel_row_number) |
| machine_3min | 來源列關聯、source_date、time_label、interval_start/end、machine_id、area、六態 nullable 秒數、來源衍生欄、來源品質、analysis_eligible |
| environment_3min | 來源列關聯、日期／時間、area、sensor_number、category、unit、nullable avg/max/median/min、provisional 門檻、來源品質 |
| alarm_events | 來源列關聯、精確事件時間、來源九欄、原始與正規化分類、分類狀態／規則版本；沒有來源事件 ID 時先使用來源內容指紋偵測候選重複 |
| source_quality_issues | 來源問題、來源日期／標籤、對象、原因、可空合計及目標來源列關聯 |
| validation_issues | 批次、來源列、欄位、規則代碼／版本、嚴重程度、原因與相關來源列 |
| import_metadata | 字典與 README 的完整內容、時間慣例、規格確認狀態 |

以檔案 SHA-256 防止完全相同檔案重複匯入；跨檔案重疊區間另以機台／感測點與標準化區間鍵偵測衝突。來源不同且值不同時不直接 upsert 覆寫，而是保留原始列並等待選定可信版本。不能只靠新 batch_id 就把相同期間再次加總。

SQL NULL 與0必須分開；不要使用 COALESCE(seconds,0) 隱藏缺漏。三分鐘與每日彙總資料須用粒度隔離，不能重複加總同一期間。未來週／月比例應先篩選合格來源，再加總分子分母秒數重新計算，不能平均每日百分比。

types.ts 定義 HistoryImportPort 介面；SQLite 實作位於獨立模組，不改變既有解析器行為。資料可完整持久保存，但正式分析前仍需確認來源缺漏原因、字典時區慣例、企業正式門檻，以及事件分類的業務確認方式。

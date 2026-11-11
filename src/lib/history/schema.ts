// 規格來源：實際標準化檔的 data_dictionary、README 與六張表頭。
// 僅支援此三分鐘格式；其他版本需重新審閱，不套用每日資料規則。
export const HISTORY_COLUMNS = {
  machine_3min: ["日期", "時間", "區間開始", "區間結束", "機台", "區域", "None秒", "Red秒", "Yellow秒", "Green秒", "Blue秒", "White秒", "四態合計秒", "加工小時", "待機小時", "異常小時", "未開機小時", "區間加工比例", "開機加工比例", "品質狀態", "品質備註"],
  environment_3min: ["日期", "時間", "區間開始", "區間結束", "區域", "感測器編號", "類別", "平均", "最大", "中位數", "最小", "參考門檻", "最大值判斷", "品質狀態", "備註"],
  alarm_events: ["事件時間", "感測器", "感測器ID", "類型", "群組", "規則名稱", "規則條件", "當前值", "持續時間原文", "初步事件分類", "分類狀態"],
  quality_issues: ["日期", "時間", "對象", "問題", "區間合計秒"],
  data_dictionary: ["項目", "定義/規則", "說明"],
  README: ["統計項目", "數量"],
} as const;

export type HistorySheetName = keyof typeof HISTORY_COLUMNS;
export const HISTORY_SHEETS = Object.keys(HISTORY_COLUMNS) as HistorySheetName[];
export const MACHINE_IDS = ["A1", "A2", "A3", "A4", "B1", "B2", "B3", "B4"] as const;
export type MachineId = (typeof MACHINE_IDS)[number];

// 精確核對已人工審閱的關鍵字典定義。字典更改時禁止默默套用舊規則。
export const SUPPORTED_DEFINITIONS = {
  "資料粒度": "每筆為3分鐘；每日每台480筆",
  "日期／時間": "保留來源檔日期及00:03至24:00標籤",
  "區間開始／結束": "結束標籤向前3分鐘",
  "跨日24:00": "區間結束為次日00:00，日期欄仍為來源當日",
  "燈號時間單位": "秒",
  "None / Green": "未開機／加工中",
  "Yellow / Red": "待機或完成／異常或故障燈號",
  "Blue / White": "保留原始值；非零標記",
  "四態合計秒": "None+Red+Yellow+Green",
  "區間合計檢查": "六態合計180秒±1秒",
  "加工比例": "Green/(None+Red+Yellow+Green)",
  "開機加工比例": "Green/(Red+Yellow+Green)",
  "各狀態小時": "來源秒數/3600",
  "環境統計": "直接保留該三分鐘AVG、MAX、MED、MIN",
  "參考門檻": "溫度26°C、濕度40%RH",
  "警報": "保留事件時間與原始九欄",
  "事件分類": "依type與感測器、規則文字初步分類",
} as const;

export const HISTORY_RULE_VERSION = "three-minute-v1";

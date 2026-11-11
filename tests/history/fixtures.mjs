import { zipSync, strToU8 } from "fflate";
import { HISTORY_COLUMNS, SUPPORTED_DEFINITIONS } from "../../src/lib/history/schema.ts";

// 純合成單元測試資料，不是企業資料，不寫入磁碟、不用來展示機台狀態。
export const TEST_SOURCE = { filename: "synthetic-unit-test-only.xlsx", sha256: "0".repeat(64), bytes: 0 };

export function fixtureSheets() {
  const data = {
    machine_3min: [["2026-10-01", "00:03", "2026-10-01 00:00:00", "2026-10-01 00:03:00", "A1", "A", 0, 0, 0, 180, 0, 0, 180, 0.05, 0, 0, 0, 1, 1, "通過", null]],
    environment_3min: [["2026-10-01", "00:03", "2026-10-01 00:00:00", "2026-10-01 00:03:00", "A", 1, "溫度", 25, 25.2, 25, 24.8, 26, "未超過參考值", "通過", "合成測試"]],
    alarm_events: [["2026-10-01 09:01:12", "合成感測器", "synthetic-sensor", "lamp", "合成群組", "合成規則", "yellow", "yellow", "1 minute", "加工完成通知", "初步分類"]],
    quality_issues: [],
    data_dictionary: [...Object.entries(SUPPORTED_DEFINITIONS).map(([key, value]) => [key, value,
      key === "區間開始／結束" ? "Asia/Taipei（+08:00），僅測試慣例，非廠商確認" : "合成測試字典"]),
      ["數值來源", "synthetic-test-only.xlsx", "合成測試"], ["未納入此標準表", "合成測試", "合成測試"]],
    README: [["資料日期", "2026-10-01"], ["時間粒度", "3分鐘（180秒）"], ["每台機台區間筆數", 480], ["機台數", 8], ["環境感測點數", 8],
      ["機台三分鐘資料列數", 1], ["環境三分鐘資料列數", 1], ["Alarm事件列數", 1], ["品質問題紀錄數", 0],
      ["加工完成通知", 1], ["環境/類比感測器警示", 0], ["缺少持續時間的警報數", 0], ["警報時間不在來源日期筆數", 0],
      ["來源檔案", "synthetic-source-only.xlsx"], ["來源SHA-256", "1".repeat(64)]],
  };
  return Object.entries(data).map(([name, rows]) => ({ name, headers: [...HISTORY_COLUMNS[name]],
    rows: rows.map((cells, index) => ({ row: index + 2, cells: [...cells] })) }));
}

export function setCell(sheets, name, column, value, index = 0) {
  const sheet = sheets.find((item) => item.name === name);
  sheet.rows[index].cells[sheet.headers.indexOf(column)] = value;
}

function escape(value) { return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"); }
function columnName(index) {
  let name = "";
  for (let position = index + 1; position > 0; position = Math.floor((position - 1) / 26)) name = String.fromCharCode(65 + (position - 1) % 26) + name;
  return name;
}

export function fixtureZip(sheets = fixtureSheets(), transform = (_name, xml) => xml) {
  const files = {};
  const ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  files["xl/workbook.xml"] = strToU8('<x:workbook xmlns:x="' + ns + '" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><x:sheets>' +
    sheets.map((sheet, index) => '<x:sheet name="' + escape(sheet.name) + '" sheetId="' + (index + 1) + '" r:id="rId' + (index + 1) + '"/>').join("") + '</x:sheets></x:workbook>');
  files["xl/_rels/workbook.xml.rels"] = strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    sheets.map((_sheet, index) => '<Relationship Id="rId' + (index + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (index + 1) + '.xml"/>').join("") + '</Relationships>');
  sheets.forEach((sheet, sheetIndex) => {
    const rows = [{ row: 1, cells: sheet.headers }, ...sheet.rows];
    const xml = '<x:worksheet xmlns:x="' + ns + '"><x:sheetData>' + rows.map(row => '<x:row r="' + row.row + '">' + row.cells.map((cell, index) => {
      const address = columnName(index) + row.row;
      if (cell === null) return '<x:c r="' + address + '"/>';
      if (typeof cell === "number") return '<x:c r="' + address + '" t="n"><x:v>' + cell + '</x:v></x:c>';
      if (typeof cell === "object" && cell.kind === "number") return '<x:c r="' + address + '" t="n"><x:v>' + escape(cell.lexeme) + '</x:v></x:c>';
      return '<x:c r="' + address + '" t="inlineStr"><x:is><x:t xml:space="preserve">' + escape(cell) + '</x:t></x:is></x:c>';
    }).join("") + '</x:row>').join("") + '</x:sheetData></x:worksheet>';
    const name = 'xl/worksheets/sheet' + (sheetIndex + 1) + '.xml';
    files[name] = strToU8(transform(name, xml));
  });
  return zipSync(files);
}

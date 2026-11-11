// 只有三分鐘觀測表；未來每日資料必須使用另一張表與獨立匯入規則。
export const APPLICATION_ID = 0x4a59494e;
export const SCHEMA_VERSION = 1;

const provenance = `
  id INTEGER PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES import_batches(id),
  raw_row_id INTEGER NOT NULL UNIQUE,
`;
const interval = `
  source_date TEXT,
  time_label TEXT,
  interval_start TEXT,
  interval_end TEXT,
  grain_seconds INTEGER NOT NULL DEFAULT 180 CHECK (grain_seconds = 180),
`;
const quality = `
  source_quality_status TEXT,
  source_quality_notes TEXT,
  system_validation_status TEXT NOT NULL CHECK (system_validation_status IN ('passed','warning','error')),
  analysis_eligible INTEGER NOT NULL CHECK (analysis_eligible IN (0,1)),
`;
function rawForeignKey(sheet: string) {
  return `sheet_name TEXT NOT NULL DEFAULT '${sheet}' CHECK (sheet_name = '${sheet}'),
    FOREIGN KEY (raw_row_id,batch_id,sheet_name) REFERENCES raw_excel_rows(id,batch_id,sheet_name)`;
}

export const SCHEMA_SQL = `
CREATE TABLE import_batches (
  id TEXT PRIMARY KEY,
  source_sha256 TEXT NOT NULL UNIQUE CHECK (length(source_sha256) = 64),
  source_filename TEXT NOT NULL,
  source_bytes INTEGER NOT NULL CHECK (source_bytes >= 0),
  source_date TEXT NOT NULL,
  grain_seconds INTEGER NOT NULL CHECK (grain_seconds = 180),
  parser_version TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  system_validation_status TEXT NOT NULL CHECK (system_validation_status IN ('passed','warning','error')),
  contract_json TEXT NOT NULL CHECK (json_valid(contract_json)),
  quality_summary_json TEXT NOT NULL CHECK (json_valid(quality_summary_json))
) STRICT;
CREATE TABLE excel_sheets (
  batch_id TEXT NOT NULL REFERENCES import_batches(id),
  name TEXT NOT NULL,
  headers_json TEXT NOT NULL CHECK (json_valid(headers_json)),
  PRIMARY KEY (batch_id,name)
) STRICT;
CREATE TABLE raw_excel_rows (
  id INTEGER PRIMARY KEY,
  batch_id TEXT NOT NULL,
  sheet_name TEXT NOT NULL,
  row_number INTEGER NOT NULL CHECK (row_number >= 2),
  values_json TEXT NOT NULL CHECK (json_valid(values_json)),
  UNIQUE (batch_id,sheet_name,row_number),
  UNIQUE (id,batch_id,sheet_name),
  FOREIGN KEY (batch_id,sheet_name) REFERENCES excel_sheets(batch_id,name)
) STRICT;
CREATE TABLE machine_3min (
  ${provenance} ${interval}
  machine_id TEXT CHECK (machine_id IS NULL OR machine_id IN ('A1','A2','A3','A4','B1','B2','B3','B4')),
  area TEXT CHECK (area IS NULL OR area IN ('A','B')),
  none_seconds REAL, red_seconds REAL, yellow_seconds REAL, green_seconds REAL, blue_seconds REAL, white_seconds REAL,
  source_four_state_seconds REAL,
  source_green_hours REAL, source_yellow_hours REAL, source_red_hours REAL, source_none_hours REAL,
  source_interval_ratio REAL, source_powered_ratio REAL,
  ${quality}
  ${rawForeignKey("machine_3min")},
  UNIQUE (id,batch_id),
  CHECK (analysis_eligible = 0 OR (source_quality_status = '通過' AND system_validation_status <> 'error'
    AND machine_id IS NOT NULL AND interval_start IS NOT NULL AND interval_end IS NOT NULL
    AND none_seconds IS NOT NULL AND red_seconds IS NOT NULL AND yellow_seconds IS NOT NULL
    AND green_seconds IS NOT NULL AND blue_seconds IS NOT NULL AND white_seconds IS NOT NULL
    AND blue_seconds = 0 AND white_seconds = 0))
) STRICT;
CREATE TABLE environment_3min (
  ${provenance} ${interval}
  area TEXT, sensor_number TEXT, category TEXT, unit TEXT CHECK (unit IS NULL OR unit IN ('°C','%RH')),
  average REAL, maximum REAL, median REAL, minimum REAL,
  reference_threshold REAL,
  threshold_provisional INTEGER NOT NULL CHECK (threshold_provisional = 1),
  source_judgment TEXT,
  ${quality}
  ${rawForeignKey("environment_3min")}
) STRICT;
CREATE TABLE alarm_events (
  ${provenance}
  occurred_at TEXT, sensor TEXT, sensor_id TEXT, sensor_type TEXT, source_group TEXT,
  rule_name TEXT, rule_condition_json TEXT CHECK (rule_condition_json IS NULL OR json_valid(rule_condition_json)),
  current_value_json TEXT CHECK (current_value_json IS NULL OR json_valid(current_value_json)),
  duration_text TEXT, source_category TEXT, classification_status TEXT,
  category TEXT NOT NULL CHECK (category IN ('completion_notice','environment_alert','unclassified')),
  event_fingerprint TEXT NOT NULL,
  system_validation_status TEXT NOT NULL CHECK (system_validation_status IN ('passed','warning','error')),
  ${rawForeignKey("alarm_events")}
) STRICT;
CREATE TABLE quality_issues (
  ${provenance} ${interval}
  target TEXT, reason TEXT, total_seconds REAL,
  ${rawForeignKey("quality_issues")},
  UNIQUE (id,batch_id)
) STRICT;
CREATE TABLE quality_issue_machine_links (
  batch_id TEXT NOT NULL REFERENCES import_batches(id),
  quality_issue_id INTEGER NOT NULL,
  machine_record_id INTEGER NOT NULL,
  PRIMARY KEY (quality_issue_id,machine_record_id),
  FOREIGN KEY (quality_issue_id,batch_id) REFERENCES quality_issues(id,batch_id),
  FOREIGN KEY (machine_record_id,batch_id) REFERENCES machine_3min(id,batch_id)
) STRICT;
CREATE TABLE validation_issues (
  id INTEGER PRIMARY KEY,
  batch_id TEXT NOT NULL,
  sheet_name TEXT NOT NULL,
  source_row INTEGER NOT NULL CHECK (source_row >= 1),
  raw_row_id INTEGER,
  code TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('error','warning')),
  column_name TEXT, message TEXT NOT NULL,
  related_rows_json TEXT NOT NULL CHECK (json_valid(related_rows_json)),
  CHECK ((source_row=1 AND raw_row_id IS NULL) OR (source_row>=2 AND raw_row_id IS NOT NULL)),
  FOREIGN KEY (batch_id,sheet_name) REFERENCES excel_sheets(batch_id,name),
  FOREIGN KEY (raw_row_id,batch_id,sheet_name) REFERENCES raw_excel_rows(id,batch_id,sheet_name)
) STRICT;
CREATE INDEX machine_identity_interval ON machine_3min(machine_id,interval_start,interval_end);
CREATE INDEX machine_identity_label ON machine_3min(machine_id,source_date,time_label);
CREATE INDEX environment_identity_interval ON environment_3min(area,sensor_number,category,interval_start,interval_end);
CREATE INDEX environment_identity_label ON environment_3min(area,sensor_number,category,source_date,time_label);
CREATE INDEX alarm_identity_time ON alarm_events(sensor_id,occurred_at);
CREATE INDEX alarm_fingerprint ON alarm_events(event_fingerprint);
CREATE INDEX quality_source_interval ON quality_issues(target,source_date,time_label);
CREATE INDEX validation_batch_code ON validation_issues(batch_id,code);
CREATE INDEX machine_batch ON machine_3min(batch_id);
CREATE INDEX environment_batch ON environment_3min(batch_id);
CREATE INDEX alarm_batch ON alarm_events(batch_id);
CREATE INDEX quality_batch ON quality_issues(batch_id);
`;

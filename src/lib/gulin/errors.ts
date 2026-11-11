import type { GulinFailure, GulinFailureStatus, GulinResource } from "./types";

export const FAILURE_HTTP_STATUS: Record<GulinFailureStatus, number> = {
  outside_access_window: 503,
  configuration_error: 503,
  unauthorized: 401,
  invalid_request: 400,
  method_not_allowed: 405,
  connection_timeout: 504,
  tls_certificate_error: 502,
  network_error: 502,
  upstream_http_error: 502,
  upstream_redirect: 502,
  invalid_content_type: 502,
  invalid_json: 502,
  invalid_payload: 502,
  response_too_large: 502,
  internal_error: 500,
};

const MESSAGES: Record<GulinFailureStatus, string> = {
  outside_access_window: "目前不在資料讀取時段，僅於台灣時間每日 09:00～17:00 開放。設備狀態未知。",
  configuration_error: "伺服器連線或存取控制設定不完整，請由管理者檢查。",
  unauthorized: "此內部資料介面需要授權。",
  invalid_request: "僅接受 values、groups 或 configs 資源，不接受自訂網址或其他參數。",
  method_not_allowed: "此資料介面僅允許 GET 請求。",
  connection_timeout: "資料來源回應逾時，設備狀態未知。",
  tls_certificate_error: "資料來源的 HTTPS 憑證驗證失敗，請確認憑證信任、有效期限與主機名稱。",
  network_error: "無法連接資料來源，請檢查網路及來源 IP 白名單。",
  upstream_http_error: "資料來源回傳非成功的 HTTP 狀態。",
  upstream_redirect: "資料來源回傳轉址，基於連線目標限制已拒絕跟隨。",
  invalid_content_type: "資料來源未宣告回傳 JSON。",
  invalid_json: "資料來源回傳內容無法解析為有效 JSON。",
  invalid_payload: "資料來源回傳內容未通過原始 JSON 結構檢查。",
  response_too_large: "資料來源回傳內容超過允許大小。",
  internal_error: "伺服器處理資料時發生錯誤。",
};

export function gulinFailure(
  status: GulinFailureStatus,
  resource?: GulinResource,
): GulinFailure {
  // 不轉送上游錯誤文字、網址、堆疊或原始回應。
  return { ok: false, status, message: MESSAGES[status], ...(resource ? { resource } : {}) };
}

export class GulinError extends Error {
  constructor(public readonly status: GulinFailureStatus) {
    super(MESSAGES[status]);
    this.name = "GulinError";
  }
}

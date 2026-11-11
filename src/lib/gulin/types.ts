export const GULIN_RESOURCES = ["values", "groups", "configs"] as const;
export type GulinResource = (typeof GULIN_RESOURCES)[number];

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

// 僅表示安全解析後的 JSON，不代表已驗證的設備資料或即時狀態。
export type GulinRawDocument = JsonValue[] | { [key: string]: JsonValue };

export type GulinFailureStatus =
  | "outside_access_window"
  | "configuration_error"
  | "unauthorized"
  | "invalid_request"
  | "method_not_allowed"
  | "connection_timeout"
  | "tls_certificate_error"
  | "network_error"
  | "upstream_http_error"
  | "upstream_redirect"
  | "invalid_content_type"
  | "invalid_json"
  | "invalid_payload"
  | "response_too_large"
  | "internal_error";

export interface GulinFailure {
  ok: false;
  status: GulinFailureStatus;
  message: string;
  resource?: GulinResource;
  upstreamStatus?: number;
}

export interface GulinReceived {
  ok: true;
  status: "received_unvalidated";
  resource: GulinResource;
  receivedAt: string;
  raw: GulinRawDocument;
}

export type GulinClientResult = GulinReceived | GulinFailure;
export type GulinEnvironment = Readonly<Record<string, string | undefined>>;

export function isGulinResource(value: string): value is GulinResource {
  return GULIN_RESOURCES.some((resource) => resource === value);
}

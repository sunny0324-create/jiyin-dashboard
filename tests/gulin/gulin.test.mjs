import assert from "node:assert/strict";
import { test } from "node:test";
import { isGulinAccessAllowed } from "../../src/lib/gulin/access-window.ts";
import { getGulinUrl } from "../../src/lib/gulin/config.ts";
import { createGulinClient } from "../../src/lib/gulin/client.ts";
import { createGulinHandler } from "../../src/lib/gulin/handler.ts";
import { parseGulinDocument } from "../../src/lib/gulin/validation.ts";
import { FAILURE_HTTP_STATUS, gulinFailure } from "../../src/lib/gulin/errors.ts";
import { GET, HEAD, runtime, dynamic } from "../../src/app/api/gulin/route.ts";

// 全部為測試專用設定與資料，不代表廠商資料或真實設備狀態。
const TOKEN = "offline-test-credential-0000000000000000";
const ENV = Object.freeze({
  GULIN_ALLOWED_ORIGIN: "https://vendor.example.invalid:5443",
  GULIN_VALUES_URL: "https://vendor.example.invalid:5443/api/sensors/values",
  GULIN_GROUPS_URL: "https://vendor.example.invalid:5443/api/sensors/groups",
  GULIN_CONFIGS_URL: "https://vendor.example.invalid:5443/api/sensors/configs",
  GULIN_INTERNAL_TOKEN: TOKEN,
});
const OPEN = () => new Date("2026-11-11T12:00:00+08:00");
const jsonResponse = (value = { testFixture: true }) => new Response(JSON.stringify(value), {
  headers: { "Content-Type": "application/json; charset=utf-8" },
});

function setup(overrides = {}) {
  let calls = 0;
  const client = createGulinClient({
    env: () => ENV,
    now: OPEN,
    fetch: async () => { calls++; return jsonResponse(); },
    ...overrides,
  });
  return { client, calls: () => calls };
}

function request(query = "", headers = { Authorization: "Bearer " + TOKEN }, method = "GET") {
  return new Request("http://localhost/api/gulin" + query, { headers, method });
}

for (const [time, allowed] of [
  ["08:59:00", false], ["08:59:59.999", false], ["09:00:00", true],
  ["16:59:00", true], ["16:59:59.999", true], ["17:00:00", false],
  ["00:00:00", false], ["23:59:59", false],
]) {
  test("台灣時間 " + time + (allowed ? " 允許" : " 禁止") + "，阻擋時不呼叫 transport", async () => {
    const now = () => new Date("2026-11-11T" + time + "+08:00");
    assert.equal(isGulinAccessAllowed(now()), allowed);
    const fixture = setup({ now });
    const result = await fixture.client("values");
    assert.equal(result.ok, allowed);
    assert.equal(fixture.calls(), allowed ? 1 : 0);
    if (!allowed) assert.equal(result.status, "outside_access_window");
  });
}

test("UTC、跨日與不同輸入時差均以 Asia/Taipei 判斷；無效時間拒絕", () => {
  assert.equal(isGulinAccessAllowed(new Date("2026-11-11T01:00:00Z")), true);
  assert.equal(isGulinAccessAllowed(new Date("2026-11-11T09:00:00Z")), false);
  assert.equal(isGulinAccessAllowed(new Date("2026-11-10T17:00:00-08:00")), true);
  assert.equal(isGulinAccessAllowed(new Date("invalid")), false);
  // 規則為每日，週末同樣生效。
  assert.equal(isGulinAccessAllowed(new Date("2026-11-14T09:00:00+08:00")), true);
});

test("檢查設定期間跨越 17:00 時，不得送出新請求", async () => {
  let clockReads = 0;
  const fixture = setup({ now: () => new Date(clockReads++ === 0 ?
    "2026-11-11T16:59:59.999+08:00" : "2026-11-11T17:00:00+08:00") });
  assert.equal((await fixture.client("values")).status, "outside_access_window");
  assert.equal(fixture.calls(), 0);
});

test("非開放時段即使設定缺失，也不嘗試連線", async () => {
  const fixture = setup({ env: () => ({}), now: () => new Date("2026-11-11T08:59:00+08:00") });
  assert.equal((await fixture.client("values")).status, "outside_access_window");
  assert.equal(fixture.calls(), 0);
});

for (const resource of ["values", "groups", "configs"]) {
  test(resource + " 缺少 URL 時回傳設定錯誤，且不連線", async () => {
    const fixture = setup({ env: () => ({ ...ENV, ["GULIN_" + resource.toUpperCase() + "_URL"]: undefined }) });
    const result = await fixture.client(resource);
    assert.equal(result.status, "configuration_error");
    assert.equal(fixture.calls(), 0);
  });
}

for (const [label, settings] of [
  ["未設定允許來源", { GULIN_ALLOWED_ORIGIN: undefined }],
  ["HTTP", { GULIN_VALUES_URL: "http://vendor.example.invalid:5443/api/sensors/values" }],
  ["不同主機", { GULIN_VALUES_URL: "https://attacker.example.invalid:5443/api/sensors/values" }],
  ["不同連接埠", { GULIN_VALUES_URL: "https://vendor.example.invalid/api/sensors/values" }],
  ["錯誤資源路徑", { GULIN_VALUES_URL: ENV.GULIN_GROUPS_URL }],
  ["查詢參數", { GULIN_VALUES_URL: ENV.GULIN_VALUES_URL + "?target=other" }],
  ["片段", { GULIN_VALUES_URL: ENV.GULIN_VALUES_URL + "#other" }],
  ["內嵌帳密", { GULIN_VALUES_URL: "https://user:secret@vendor.example.invalid:5443/api/sensors/values" }],
  ["非法網址", { GULIN_VALUES_URL: "invalid" }],
  ["來源包含路徑", { GULIN_ALLOWED_ORIGIN: "https://vendor.example.invalid:5443/private" }],
]) {
  test("拒絕不安全的端點設定：" + label, async () => {
    const fixture = setup({ env: () => ({ ...ENV, ...settings }) });
    assert.equal((await fixture.client("values")).status, "configuration_error");
    assert.equal(fixture.calls(), 0);
  });
}

test("三個端點均只使用明確設定的 HTTPS 主機與固定路徑", () => {
  for (const resource of ["values", "groups", "configs"]) {
    assert.equal(getGulinUrl(resource, ENV).pathname, "/api/sensors/" + resource);
  }
});

test("統一 GET、禁止快取與轉址，不傳內部憑證、不改 TLS 選項", async () => {
  const fixture = setup({ fetch: async (url, options) => {
    assert.equal(String(url), ENV.GULIN_VALUES_URL);
    assert.deepEqual(Object.keys(options).sort(), ["method", "headers", "cache", "redirect", "credentials", "signal"].sort());
    assert.equal(options.method, "GET");
    assert.equal(options.cache, "no-store");
    assert.equal(options.redirect, "manual");
    assert.equal(options.credentials, "omit");
    assert.deepEqual(options.headers, { Accept: "application/json" });
    assert.ok(options.signal instanceof AbortSignal);
    return jsonResponse();
  } });
  assert.equal((await fixture.client("values")).status, "received_unvalidated");
});

test("開放時段內開始的請求可在 17:00 後完成，不超時仍正常接收", async () => {
  let reads = 0;
  const fixture = setup({ now: () => new Date(++reads <= 2 ?
    "2026-11-11T16:59:59+08:00" : "2026-11-11T17:00:01+08:00") });
  const result = await fixture.client("groups");
  assert.equal(result.ok, true);
  assert.equal(result.receivedAt, "2026-11-11T09:00:01.000Z");
});

for (const status of [301, 302, 307, 308]) {
  test("拒絕 HTTP " + status + " 轉址，不跟隨其他網址", async () => {
    let calls = 0;
    const fixture = setup({ fetch: async () => {
      calls++;
      return new Response(null, { status, headers: { Location: "http://127.0.0.1/private" } });
    } });
    assert.equal((await fixture.client("values")).status, "upstream_redirect");
    assert.equal(calls, 1);
  });
}

test("上游 HTTP 錯誤不回傳原始錯誤頁或網址", async () => {
  const fixture = setup({ fetch: async () => new Response(ENV.GULIN_VALUES_URL, { status: 403 }) });
  const result = await fixture.client("values");
  assert.equal(result.status, "upstream_http_error");
  assert.equal(result.upstreamStatus, 403);
  assert.equal(JSON.stringify(result).includes(ENV.GULIN_VALUES_URL), false);
});

test("非 JSON Content-Type 與無效 JSON 分別處理", async () => {
  const html = setup({ fetch: async () => new Response("<html>登入</html>", { headers: { "Content-Type": "text/html" } }) });
  assert.equal((await html.client("values")).status, "invalid_content_type");
  const invalid = setup({ fetch: async () => new Response("{", { headers: { "Content-Type": "application/json" } }) });
  assert.equal((await invalid.client("values")).status, "invalid_json");
});

test("接受 +json 與原始物件／陣列；不轉型為完整設備資料", async () => {
  const fixture = setup({ fetch: async () => new Response("[]", { headers: { "Content-Type": "application/vendor+json" } }) });
  const result = await fixture.client("configs");
  assert.equal(result.status, "received_unvalidated");
  assert.deepEqual(result.raw, []);
  assert.deepEqual(parseGulinDocument('{"fixture":true}'), { fixture: true });
  for (const value of ["null", "true", "1", '"text"', '{"number":1e999}', "[".repeat(70) + "0" + "]".repeat(70)]) {
    assert.throws(() => parseGulinDocument(value), { status: "invalid_payload" });
  }
});

test("回應大小上限同時檢查 Content-Length 與串流實際大小", async () => {
  const declared = setup({ fetch: async () => new Response("{}", { headers: { "Content-Type": "application/json", "Content-Length": "2097153" } }) });
  assert.equal((await declared.client("values")).status, "response_too_large");
  const streamed = setup({ fetch: async () => jsonResponse({ fixture: "x".repeat(2097153) }) });
  assert.equal((await streamed.client("values")).status, "response_too_large");
});

test("連線逾時會中止請求，回傳 connection_timeout", async () => {
  let aborted = false;
  const fixture = setup({ timeoutMs: 10, fetch: (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => { aborted = true; reject(new DOMException("測試逾時", "AbortError")); }, { once: true });
  }) });
  assert.equal((await fixture.client("values")).status, "connection_timeout");
  assert.equal(aborted, true);
});

test("逾時範圍包含讀取回應本文，不僅是等待標頭", async () => {
  const fixture = setup({ timeoutMs: 10, fetch: async (_url, { signal }) => new Response(new ReadableStream({
    start(controller) {
      signal.addEventListener("abort", () => controller.error(new DOMException("測試逾時", "AbortError")), { once: true });
    },
  }), { headers: { "Content-Type": "application/json" } }) });
  assert.equal((await fixture.client("values")).status, "connection_timeout");
});

for (const code of ["DEPTH_ZERO_SELF_SIGNED_CERT", "SELF_SIGNED_CERT_IN_CHAIN", "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "CERT_HAS_EXPIRED", "ERR_TLS_CERT_ALTNAME_INVALID"]) {
  test("保留正常驗證並辨識憑證錯誤：" + code, async () => {
    const cause = Object.assign(new Error(ENV.GULIN_VALUES_URL), { code });
    const fixture = setup({ fetch: async () => { throw new TypeError("fetch failed", { cause }); } });
    const result = await fixture.client("values");
    assert.equal(result.status, "tls_certificate_error");
    assert.equal(JSON.stringify(result).includes("https://"), false);
  });
}

test("一般網路錯誤與巢狀 AggregateError 憑證錯誤可區分", async () => {
  const offline = setup({ fetch: async () => { throw Object.assign(new Error("offline"), { code: "ECONNREFUSED" }); } });
  assert.equal((await offline.client("values")).status, "network_error");
  const tls = setup({ fetch: async () => { throw new AggregateError([Object.assign(new Error("TLS"), { code: "CERT_UNTRUSTED" })]); } });
  assert.equal((await tls.client("values")).status, "tls_certificate_error");
});

test("內部路由未設定憑證時預設拒絕；未授權不呼叫 client", async () => {
  let calls = 0;
  const client = async () => { calls++; throw new Error("不得執行"); };
  const missing = createGulinHandler({ env: () => ({}), client });
  assert.equal((await missing(request())).status, 503);
  const handler = createGulinHandler({ env: () => ENV, client });
  for (const headers of [{}, { Authorization: "Bearer wrong" }, { Authorization: "Basic wrong" }]) {
    const response = await handler(request("", headers));
    assert.equal(response.status, 401);
    assert.equal((await response.json()).status, "unauthorized");
    assert.match(response.headers.get("www-authenticate"), /^Bearer/);
  }
  assert.equal(calls, 0);
});

test("內部路由拒絕未知、重複參數與任意代理目標", async () => {
  let calls = 0;
  const handler = createGulinHandler({ env: () => ENV, client: async () => { calls++; throw new Error("不得執行"); } });
  for (const query of ["?resource=other", "?url=https://attacker.example.invalid", "?resource=values&resource=configs", "?time=09:00", "?resource="]) {
    const response = await handler(request(query));
    assert.equal(response.status, 400);
  }
  assert.equal(calls, 0);
});

test("內部路由實際串入 client 的時段控制，前端日期標頭無法繞過", async () => {
  const fixture = setup({ now: () => new Date("2026-11-11T17:00:00+08:00") });
  const handler = createGulinHandler({ env: () => ENV, client: fixture.client });
  const response = await handler(request("", { Authorization: "Bearer " + TOKEN, Date: "Wed, 11 Nov 2026 01:00:00 GMT" }));
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.status, "outside_access_window");
  assert.equal(body.accessWindow.timeZone, "Asia/Taipei");
  assert.equal(fixture.calls(), 0);
});

test("成功路由只回傳接收結果，不洩漏原始 JSON、內部 URL 或憑證", async () => {
  const fixture = setup({ fetch: async () => jsonResponse({ internalUrl: ENV.GULIN_VALUES_URL, token: TOKEN }) });
  const handler = createGulinHandler({ env: () => ENV, client: fixture.client });
  for (const resource of ["values", "groups", "configs"]) {
    const response = await handler(request("?resource=" + resource));
    assert.equal(response.status, 200);
    assert.match(response.headers.get("cache-control"), /private, no-store/);
    assert.equal(response.headers.get("vary"), "Authorization");
    assert.equal(response.headers.has("access-control-allow-origin"), false);
    const body = await response.json();
    assert.equal(body.status, "received_unvalidated");
    assert.equal(body.data, null);
    assert.equal(body.equipmentState, "unknown");
    assert.equal(body.resource, resource);
    assert.equal(JSON.stringify(body).includes(ENV.GULIN_VALUES_URL), false);
    assert.equal(JSON.stringify(body).includes(TOKEN), false);
  }
});

test("每種失敗均有統一 JSON、正確 HTTP 狀態與 no-store", async () => {
  for (const [status, httpStatus] of Object.entries(FAILURE_HTTP_STATUS)) {
    const handler = createGulinHandler({ env: () => ENV, client: async () => gulinFailure(status, "values") });
    const response = await handler(request());
    assert.equal(response.status, httpStatus);
    assert.equal((await response.json()).status, status);
    assert.match(response.headers.get("cache-control"), /no-store/);
  }
});

test("未預期錯誤不洩漏堆疊、URL 或憑證", async () => {
  const handler = createGulinHandler({ env: () => ENV, client: async () => { throw new Error(ENV.GULIN_VALUES_URL + TOKEN); } });
  const response = await handler(request());
  assert.equal(response.status, 500);
  const text = await response.text();
  assert.equal(text.includes("https://"), false);
  assert.equal(text.includes(TOKEN), false);
});

test("實際 Route Handler 使用 Node.js、動態執行；HEAD 不觸發 GET", async () => {
  assert.equal(runtime, "nodejs");
  assert.equal(dynamic, "force-dynamic");
  const head = await HEAD(request("", {}, "HEAD"));
  assert.equal(head.status, 405);
  assert.equal(head.headers.get("allow"), "GET");
  // 不載入正式環境變數；缺少內部授權設定時不得啟動連線。
  const original = process.env.GULIN_INTERNAL_TOKEN;
  delete process.env.GULIN_INTERNAL_TOKEN;
  try { assert.equal((await GET(request())).status, 503); }
  finally {
    if (original === undefined) delete process.env.GULIN_INTERNAL_TOKEN;
    else process.env.GULIN_INTERNAL_TOKEN = original;
  }
});

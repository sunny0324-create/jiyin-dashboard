import assert from "node:assert/strict";
import { test } from "node:test";
import { summarizeGulinDocument } from "../../src/lib/gulin/diagnostics.ts";
import { runGulinDiagnostic } from "../../scripts/gulin-diagnose.ts";

// 全部為離線合成樣本，不代表任何真實廠商資料。
const ENV = Object.freeze({
  GULIN_ALLOWED_ORIGIN: "https://diagnostic.example.invalid",
  GULIN_VALUES_URL: "https://diagnostic.example.invalid/api/sensors/values",
  GULIN_GROUPS_URL: "https://diagnostic.example.invalid/api/sensors/groups",
  GULIN_CONFIGS_URL: "https://diagnostic.example.invalid/api/sensors/configs",
  GULIN_INTERNAL_TOKEN: "must-not-appear-in-diagnostics-000000000000000",
});
const OPEN = () => new Date("2026-11-12T10:00:00+08:00");
const validJson = (body) => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });

function options(overrides = {}) {
  return { env: ENV, now: OPEN, fetch: async () => { throw new Error("離線測試禁止真實連線"); }, ...overrides };
}

test("欄位名稱可辨識，原始字串、數字、時間、URL、識別碼及秘密均不輸出", () => {
  const secrets = ["sensitive-device-id", "sensitive-group-name", "sensitive-person@example.invalid", ENV.GULIN_VALUES_URL, ENV.GULIN_INTERNAL_TOKEN, "2026-11-12T01:23:45Z", "987654321"];
  const raw = {
    apiType: secrets[0], updateTime: secrets[5], data: {
      [secrets[0]]: { id: secrets[0], values: { value: 987654321, [secrets[2]]: secrets[3] } },
    },
    [secrets[1]]: secrets[2], url: secrets[3], token: secrets[4],
    privateKey: { [secrets[2]]: secrets[4] },
  };
  const summary = summarizeGulinDocument(raw, "values");
  const output = JSON.stringify(summary);
  for (const secret of secrets) assert.equal(output.includes(secret), false, "不得洩漏測試識別資訊");
  assert.deepEqual(summary.topLevelFields.slice(0, 3), ["apiType", "updateTime", "data"]);
  assert.match(output, /已遮蔽欄位/);
  assert.match(output, /"redacted":true/);
  assert.deepEqual(summary.confirmedCounts, { sensorCount: 1 });
});

test("所有純量均只顯示型別，包括布林、null、數字與字串", () => {
  const result = summarizeGulinDocument({ data: ["private-value", 123456789, true, null] }, "values");
  assert.equal(result.rootType, "object");
  assert.equal(result.structure.fields[0].structure.type, "array");
  assert.equal(result.structure.fields[0].structure.itemCount, 4);
  assert.equal(result.structure.fields[0].structure.sample.type, "string");
  assert.equal(JSON.stringify(result).includes("private-value"), false);
  assert.equal(JSON.stringify(result).includes("123456789"), false);
  assert.equal(result.confirmedCounts, null);
});

test("只在明確的 values ID 對照結構成立時統計感測器", () => {
  assert.deepEqual(summarizeGulinDocument({ data: {
    fixtureA: { id: "fixtureA", values: {} }, fixtureB: { id: "fixtureB", values: {} },
  } }, "values").confirmedCounts, { sensorCount: 2 });
  for (const data of [{}, { arbitrary: 1 }, { fixture: { id: "other", values: {} } }, { fixture: { id: "fixture", values: null } }, { "": { id: "", values: {} } }]) {
    assert.equal(summarizeGulinDocument({ data }, "values").confirmedCounts, null);
  }
});

test("configs 僅統計已核對 ID、名稱、類型、單位的設定紀錄", () => {
  const config = { id: "fixtureA", displayname: "fixture-name", type: "fixture-type", unit: "fixture-unit" };
  assert.deepEqual(summarizeGulinDocument({ data: { fixtureA: { config } } }, "configs").confirmedCounts, { sensorCount: 1 });
  assert.equal(summarizeGulinDocument({ data: { fixtureA: { config: { id: "fixtureA" } } } }, "configs").confirmedCounts, null);
});

test("groups 分別統計群組紀錄與不重複群組，不推定機台數或群組內感測器數", () => {
  const raw = { data: [
    { groupId: "fixtureA", groupAlias: "fixture", sensors: {} },
    { groupId: "fixtureA", groupAlias: "fixture", sensors: {} },
    { groupId: "fixtureB", groupAlias: "fixture", sensors: {} },
  ] };
  assert.deepEqual(summarizeGulinDocument(raw, "groups").confirmedCounts, { groupRecordCount: 3, uniqueGroupCount: 2 });
  assert.equal(summarizeGulinDocument({ data: [{ groupId: "fixtureA" }] }, "groups").confirmedCounts, null);
  assert.equal(summarizeGulinDocument({ data: [] }, "groups").confirmedCounts, null);
});

test("未知結構與空集合只顯示一般項目數，不推定實體數量", () => {
  for (const raw of [[], [{ fixture: true }], {}, { data: [] }, { data: { arbitrary: {} } }]) {
    assert.equal(summarizeGulinDocument(raw, "values").confirmedCounts, null);
  }
  const array = summarizeGulinDocument([{}, {}, {}], "groups");
  assert.equal(array.rootType, "array");
  assert.equal(array.structure.itemCount, 3);
  assert.deepEqual(array.topLevelFields, []);
});

test("限制深度、樣本與欄位數，未知欄位名稱中的換行、控制碼、秘密仍不回顯", () => {
  const raw = Object.fromEntries(Array.from({ length: 200 }, (_, index) => ["private-identifier-" + index + "\u001b[31m\n", { value: "sensitive-content" }]));
  const result = summarizeGulinDocument(raw, "values");
  assert.equal(result.topLevelFields.length, 32);
  assert.equal(result.structure.fields.length, 2);
  assert.equal(result.structure.omittedFields, 198);
  assert.equal(JSON.stringify(result).includes("private-identifier"), false);
  assert.equal(JSON.stringify(result).includes("sensitive-content"), false);
  assert.equal(JSON.stringify(result).includes("\\u001b"), false);
  const deep = summarizeGulinDocument({ data: { values: { data: { values: { value: "hidden" } } } } }, "values");
  assert.match(JSON.stringify(deep), /"truncated":true/);
});

test("敏感欄位亦計入摘要的 80 節點上限", () => {
  let branch = {};
  for (let index = 0; index < 6; index++) {
    branch = { data: branch, values: branch, ...Object.fromEntries(
      Array.from({ length: 14 }, (_, key) => ["secret" + key, "hidden"]),
    ) };
  }
  const summary = summarizeGulinDocument(branch, "values");
  const count = (node) => 1 + (node.fields ?? []).reduce((sum, field) => sum + count(field.structure), 0) +
    (node.sample ? count(node.sample) : 0);
  assert(count(summary.structure) <= 80);
});

for (const args of [[], ["--help"], ["--execute"], ["--resource", "all", "--execute"], ["--resource", "values", "--execute", "--execute"], ["--resource", "values", "--url", ENV.GULIN_VALUES_URL], ["--resource", "values", "--resource", "groups"]]) {
  test("說明或非法參數永不連線，且不回顯輸入參數：" + JSON.stringify(args.filter(arg => !arg.startsWith("https:"))), async () => {
    let calls = 0;
    const result = await runGulinDiagnostic(args, options({ fetch: async () => { calls++; return validJson({}); } }));
    assert.equal(calls, 0);
    assert.equal(result.report.requestsMade, 0);
    assert.equal(JSON.stringify(result.report).includes(ENV.GULIN_VALUES_URL), false);
  });
}

test("預設只做預檢，開放時段也不發出請求，不宣稱已通過遠端 TLS", async () => {
  let calls = 0;
  const result = await runGulinDiagnostic(["--resource", "values"], options({ fetch: async () => { calls++; return validJson({}); } }));
  assert.equal(result.exitCode, 0);
  assert.equal(result.report.status, "preflight_only");
  assert.equal(result.report.tlsTrust, "not_tested");
  assert.equal(result.report.requestsMade, 0);
  assert.equal(calls, 0);
});

test("缺少設定或偵測到停用 TLS 驗證時拒絕執行", async () => {
  let calls = 0;
  const fetch = async () => { calls++; return validJson({}); };
  const missing = await runGulinDiagnostic(["--resource", "values", "--execute"], options({ env: {}, fetch }));
  assert.equal(missing.report.status, "configuration_error");
  const unsafe = await runGulinDiagnostic(["--resource", "values", "--execute"], options({ env: { ...ENV, NODE_TLS_REJECT_UNAUTHORIZED: "0" }, fetch }));
  assert.equal(unsafe.report.status, "unsafe_tls_configuration");
  assert.equal(unsafe.exitCode, 2);
  assert.equal(calls, 0);
});

test("非開放時段即使指定 execute 也不連線", async () => {
  let calls = 0;
  const result = await runGulinDiagnostic(["--resource", "values", "--execute"], options({
    now: () => new Date("2026-11-12T17:00:00+08:00"), fetch: async () => { calls++; return validJson({}); },
  }));
  assert.equal(result.report.status, "outside_access_window");
  assert.equal(result.report.httpStatus, null);
  assert.equal(result.report.requestsMade, 0);
  assert.equal(calls, 0);
});

for (const resource of ["values", "groups", "configs"]) {
  test(resource + " 僅單次 GET，無重試、無寫檔，輸出已遮蔽摘要", async () => {
    let calls = 0;
    const raw = { data: { "fixture-id": { id: "fixture-id", values: { value: "do-not-print" } } }, token: ENV.GULIN_INTERNAL_TOKEN, url: ENV.GULIN_VALUES_URL };
    const result = await runGulinDiagnostic(["--resource", resource, "--execute"], options({ fetch: async (url, init) => {
      calls++;
      assert.equal(String(url), ENV["GULIN_" + resource.toUpperCase() + "_URL"]);
      assert.equal(init.method, "GET");
      assert.equal(init.redirect, "manual");
      assert.equal(init.cache, "no-store");
      assert.deepEqual(init.headers, { Accept: "application/json" });
      return validJson(raw);
    } }));
    assert.equal(calls, 1);
    assert.equal(result.report.requestsMade, 1);
    assert.equal(result.report.retries, 0);
    assert.equal(result.report.httpStatus, 200);
    assert.equal(result.report.jsonValid, true);
    assert.equal(result.report.status, "received_unvalidated");
    for (const secret of ["fixture-id", "do-not-print", ENV.GULIN_INTERNAL_TOKEN, ENV.GULIN_VALUES_URL]) {
      assert.equal(JSON.stringify(result.report).includes(secret), false);
    }
  });
}

for (const [name, response, status, format, valid] of [
  ["HTML", () => new Response("<html>private</html>", { headers: { "Content-Type": "text/html" } }), "invalid_content_type", "not_json", null],
  ["缺少格式", () => new Response(new Uint8Array([123, 125])), "invalid_content_type", "missing", null],
  ["損壞 JSON", () => new Response("{", { headers: { "Content-Type": "application/json" } }), "invalid_json", "json", false],
  ["JSON 純量", () => validJson("private-value"), "invalid_payload", "json", true],
  ["HTTP 拒絕", () => new Response(ENV.GULIN_VALUES_URL, { status: 403 }), "upstream_http_error", "not_json", null],
]) {
  test("正確顯示 HTTP、格式與 JSON 檢查結果：" + name, async () => {
    const result = await runGulinDiagnostic(["--resource", "values", "--execute"], options({ fetch: async () => response() }));
    assert.equal(result.report.status, status);
    assert.equal(result.report.responseFormat, format);
    assert.equal(result.report.jsonValid, valid);
    assert.equal(result.exitCode, 1);
    assert.equal(JSON.stringify(result.report).includes(ENV.GULIN_VALUES_URL), false);
  });
}

test("TLS 憑證失敗明確標示阻擋，不宣稱有 HTTP 回應或取得資料", async () => {
  let calls = 0;
  const result = await runGulinDiagnostic(["--resource", "values", "--execute"], options({ fetch: async () => {
    calls++;
    throw new TypeError(ENV.GULIN_VALUES_URL, { cause: Object.assign(new Error(ENV.GULIN_INTERNAL_TOKEN), { code: "DEPTH_ZERO_SELF_SIGNED_CERT" }) });
  } }));
  assert.equal(calls, 1);
  assert.equal(result.report.status, "tls_certificate_error");
  assert.equal(result.report.tlsTrust, "blocked");
  assert.equal(result.report.httpStatus, null);
  assert.equal(result.report.jsonValid, null);
  assert.equal(result.report.structure, undefined);
  assert.match(result.report.nextStep, /TLS 阻擋/);
  assert.equal(JSON.stringify(result.report).includes(ENV.GULIN_INTERNAL_TOKEN), false);
});

test("錯誤與轉址不重試、不跟隨", async () => {
  for (const response of [() => new Response(null, { status: 307, headers: { Location: "http://127.0.0.1/private" } }), () => new Response(null, { status: 503 })]) {
    let calls = 0;
    const result = await runGulinDiagnostic(["--resource", "values", "--execute"], options({ fetch: async () => { calls++; return response(); } }));
    assert.equal(calls, 1);
    assert.equal(result.exitCode, 1);
    assert.equal(result.report.retries, 0);
    assert.equal(JSON.stringify(result.report).includes("127.0.0.1"), false);
  }
});

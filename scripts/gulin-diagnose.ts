import nextEnv from "@next/env";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { GULIN_ACCESS_WINDOW, isGulinAccessAllowed } from "../src/lib/gulin/access-window";
import { createGulinClient } from "../src/lib/gulin/client";
import { getGulinUrl } from "../src/lib/gulin/config";
import { summarizeGulinDocument } from "../src/lib/gulin/diagnostics";
import { isGulinResource } from "../src/lib/gulin/types";
import type { GulinEnvironment, GulinResource } from "../src/lib/gulin/types";

interface DiagnosticDependencies {
  env?: GulinEnvironment;
  fetch?: typeof fetch;
  now?: () => Date;
}

interface DiagnosticResult {
  exitCode: number;
  report: Record<string, unknown>;
}

const USAGE = [
  "本機預檢（不連線）：npm run diagnose:gulin -- --resource values",
  "單次讀取（會連線）：npm run diagnose:gulin -- --resource values --execute",
  "resource 僅限 values、groups、configs，必須分別執行；不支援 all、輪詢、重試或自訂網址。",
  "只輸出遮蔽摘要，不寫入資料檔；成功接收不表示機台在線。",
];

function parseArgs(args: string[]): { resource: GulinResource; execute: boolean } | null {
  let resource: string | undefined;
  let execute = false;
  for (let index = 0; index < args.length; index++) {
    if (args[index] === "--resource" && resource === undefined) resource = args[++index];
    else if (args[index] === "--execute" && !execute) execute = true;
    else return null;
  }
  return resource && isGulinResource(resource) ? { resource, execute } : null;
}

function localEnvironment(): GulinEnvironment {
  // 僅於明確指定資源後載入，不輸出環境值或載入器訊息。
  const projectRoot = fileURLToPath(new URL("../", import.meta.url));
  return nextEnv.loadEnvConfig(projectRoot, process.env.NODE_ENV !== "production", {
    info() {}, error() {},
  }).combinedEnv;
}

export async function runGulinDiagnostic(
  args: string[],
  dependencies: DiagnosticDependencies = {},
): Promise<DiagnosticResult> {
  if (!args.length || (args.length === 1 && args[0] === "--help")) {
    return { exitCode: 0, report: { status: "help", requestsMade: 0, usage: USAGE } };
  }
  const parsed = parseArgs(args);
  if (!parsed) return { exitCode: 2, report: { status: "invalid_arguments", requestsMade: 0, usage: USAGE } };

  try {
    const env = dependencies.env ?? localEnvironment();
    const now = dependencies.now ?? (() => new Date());
    const base = {
      mode: parsed.execute ? "single_request" : "preflight",
      resource: parsed.resource,
      accessWindow: { ...GULIN_ACCESS_WINDOW, currentlyAllowed: isGulinAccessAllowed(now()) },
      retries: 0,
    };
    if (env.NODE_TLS_REJECT_UNAUTHORIZED === "0") {
      return { exitCode: 2, report: { ...base, status: "unsafe_tls_configuration", requestsMade: 0,
        message: "偵測到停用 TLS 驗證的程序設定，拒絕執行。請先移除該設定並重新啟動程序。" } };
    }
    try { getGulinUrl(parsed.resource, env); }
    catch {
      return { exitCode: 2, report: { ...base, status: "configuration_error", requestsMade: 0,
        message: "伺服器端點或允許來源設定無效；不輸出設定值。" } };
    }
    if (!parsed.execute) {
      return { exitCode: 0, report: { ...base, status: "preflight_only", requestsMade: 0,
        configurationValid: true, tlsVerification: "enabled", tlsTrust: "not_tested",
        message: "只完成本機預檢，未驗證遠端憑證或取得資料；真實測試仍須排除已知 TLS 信任問題。" } };
    }

    let requestsMade = 0;
    const observation: { httpStatus: number | null; format: "json" | "not_json" | "missing" | null } = {
      httpStatus: null, format: null,
    };
    const transport = dependencies.fetch ?? globalThis.fetch;
    const client = createGulinClient({
      env: () => env, now,
      fetch: async (input, init) => {
        if (requestsMade !== 0) throw new Error("診斷僅允許一次 GET。");
        requestsMade++;
        const response = await transport(input, init);
        observation.httpStatus = response.status;
        const mime = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
        // 僅顯示格式分類，不回顯上游標頭內容（可能夾帶網址或其他識別資訊）。
        observation.format = !mime ? "missing" :
          /^application\/(?:json|[a-z0-9!#$&^_.+-]+\+json)$/.test(mime) ? "json" : "not_json";
        return response;
      },
    });
    const result = await client(parsed.resource);
    const report = {
      ...base, status: result.status, requestsMade,
      httpStatus: observation.httpStatus, responseFormat: observation.format,
      jsonValid: result.ok || result.status === "invalid_payload" ? true :
        result.status === "invalid_json" ? false : null,
      tlsVerification: "enabled",
      tlsTrust: result.status === "tls_certificate_error" ? "blocked" :
        observation.httpStatus !== null ? "passed_for_this_request" : "not_tested",
    };
    if (!result.ok) return { exitCode: 1, report: { ...report, message: result.message,
      ...(result.status === "tls_certificate_error" ? {
        nextStep: "真實資料測試被 TLS 阻擋。請核對廠商授權 CA、憑證鏈及 SAN 的 IP／網域，再維持驗證重測。",
      } : {}),
    } };
    return { exitCode: 0, report: { ...report, receivedAt: result.receivedAt,
      ...summarizeGulinDocument(result.raw, parsed.resource) } };
  } catch {
    return { exitCode: 2, report: { status: "diagnostic_error",
      message: "本機診斷無法完成；不輸出原始例外、網址或秘密設定。" } };
  }
}

// 匯入供離線測試時不自動執行；只有直接啟動 CLI 才輸出報告。
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void runGulinDiagnostic(process.argv.slice(2)).then(({ report, exitCode }) => {
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = exitCode;
  }).catch(() => {
    console.error("本機診斷無法啟動；未輸出原始例外或秘密設定。");
    process.exitCode = 2;
  });
}

import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import { GULIN_ACCESS_WINDOW } from "./access-window";
import { createGulinClient } from "./client";
import { FAILURE_HTTP_STATUS, gulinFailure } from "./errors";
import { isGulinResource } from "./types";
import type { GulinEnvironment, GulinFailure } from "./types";

interface HandlerDependencies {
  client?: ReturnType<typeof createGulinClient>;
  env?: () => GulinEnvironment;
}

function json(body: object, status: number): Response {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      Pragma: "no-cache",
      Expires: "0",
      Vary: "Authorization",
      "X-Content-Type-Options": "nosniff",
      ...(status === 401 ? { "WWW-Authenticate": 'Bearer realm="gulin-internal"' } : {}),
      ...(status === 405 ? { Allow: "GET" } : {}),
    },
  });
}

function failureResponse(failure: GulinFailure): Response {
  return json({ ...failure, accessWindow: GULIN_ACCESS_WINDOW }, FAILURE_HTTP_STATUS[failure.status]);
}

export function createGulinHandler(dependencies: HandlerDependencies = {}) {
  const env = dependencies.env ?? (() => process.env);
  const client = dependencies.client ?? createGulinClient({ env });

  return async function handleGulin(request: Request): Promise<Response> {
    try {
      if (request.method !== "GET") return failureResponse(gulinFailure("method_not_allowed"));
      const expected = env().GULIN_INTERNAL_TOKEN;
      // 尚無使用者登入系統，先以伺服器呼叫憑證保護，預設拒絕未授權讀取。
      if (!expected || expected.length < 32) return failureResponse(gulinFailure("configuration_error"));
      const provided = request.headers.get("authorization")?.match(/^Bearer ([^\s]+)$/i)?.[1];
      if (!provided || provided.length > 4096 || !timingSafeEqual(
        createHash("sha256").update(provided).digest(),
        createHash("sha256").update(expected).digest(),
      )) return failureResponse(gulinFailure("unauthorized"));

      const params = new URL(request.url).searchParams;
      const resource = params.get("resource") ?? "values";
      if (!isGulinResource(resource) || params.getAll("resource").length > 1 ||
        [...params.keys()].some((key) => key !== "resource")) {
        return failureResponse(gulinFailure("invalid_request"));
      }
      const result = await client(resource);
      if (!result.ok) return failureResponse(result);
      // 原始 JSON 留在伺服器記憶體。正式 schema、業務狀態與安全 DTO 尚未確認，
      // 此階段只公開接收結果，避免回傳內部網址或誤稱即時設備資料。
      return json({
        ok: true,
        status: result.status,
        resource: result.resource,
        receivedAt: result.receivedAt,
        data: null,
        validation: "raw_json_only",
        equipmentState: "unknown",
        message: "已收到 JSON，尚未完成資料語意、機台對應及新鮮度驗證。",
        accessWindow: GULIN_ACCESS_WINDOW,
      }, 200);
    } catch {
      return failureResponse(gulinFailure("internal_error"));
    }
  };
}

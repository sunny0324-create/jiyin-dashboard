import "server-only";

import { isGulinAccessAllowed } from "./access-window";
import { getGulinUrl } from "./config";
import { GulinError, gulinFailure } from "./errors";
import { parseGulinDocument } from "./validation";
import type { GulinClientResult, GulinEnvironment, GulinResource } from "./types";

const TLS_CERTIFICATE_CODES = new Set([
  "DEPTH_ZERO_SELF_SIGNED_CERT", "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "UNABLE_TO_GET_ISSUER_CERT",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY", "CERT_UNTRUSTED", "CERT_REJECTED",
  "CERT_HAS_EXPIRED", "CERT_NOT_YET_VALID", "CERT_REVOKED",
  "ERR_TLS_CERT_ALTNAME_INVALID", "INVALID_CA",
]);

function hasCertificateError(error: unknown, seen = new Set<unknown>()): boolean {
  if (typeof error !== "object" || error === null || seen.has(error) || seen.size > 12) return false;
  seen.add(error);
  if ("code" in error && typeof error.code === "string" && TLS_CERTIFICATE_CODES.has(error.code)) return true;
  if ("cause" in error && hasCertificateError(error.cause, seen)) return true;
  return "errors" in error && Array.isArray(error.errors) &&
    error.errors.some((item) => hasCertificateError(item, seen));
}

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

async function readJsonText(response: Response): Promise<string> {
  if (Number(response.headers.get("content-length")) > MAX_RESPONSE_BYTES) {
    void response.body?.cancel().catch(() => {});
    throw new GulinError("response_too_large");
  }
  if (!response.body) throw new GulinError("invalid_json");
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0;
  let text = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) throw new GulinError("response_too_large");
      try {
        text += decoder.decode(value, { stream: true });
      } catch {
        throw new GulinError("invalid_json");
      }
    }
    try {
      return text + decoder.decode();
    } catch {
      throw new GulinError("invalid_json");
    }
  } finally {
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

interface ClientDependencies {
  env?: () => GulinEnvironment;
  fetch?: typeof fetch;
  now?: () => Date;
  timeoutMs?: number;
}

export function createGulinClient(dependencies: ClientDependencies = {}) {
  const env = dependencies.env ?? (() => process.env);
  const send = dependencies.fetch ?? globalThis.fetch;
  const now = dependencies.now ?? (() => new Date());
  const timeoutMs = dependencies.timeoutMs ?? 10_000;

  return async function readGulin(resource: GulinResource): Promise<GulinClientResult> {
    if (!isGulinAccessAllowed(now())) return gulinFailure("outside_access_window", resource);
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const url = getGulinUrl(resource, env());
      // 設定讀取完成後、實際送出前再檢查；跨越 17:00 不得新增請求。
      if (!isGulinAccessAllowed(now())) return gulinFailure("outside_access_window", resource);
      if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new GulinError("configuration_error");
      timeout = setTimeout(() => controller.abort(), timeoutMs);
      const response = await send(url, {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
        redirect: "manual",
        credentials: "omit",
        signal: controller.signal,
      });
      // 不設定 HTTPS Agent 或 dispatcher：沿用正常 TLS 驗證。
      if (response.status >= 300 && response.status < 400) {
        void response.body?.cancel().catch(() => {});
        throw new GulinError("upstream_redirect");
      }
      if (!response.ok) {
        void response.body?.cancel().catch(() => {});
        return { ...gulinFailure("upstream_http_error", resource), upstreamStatus: response.status };
      }
      const contentType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
      if (!contentType || !/^application\/(?:json|[a-z0-9!#$&^_.+-]+\+json)$/.test(contentType)) {
        void response.body?.cancel().catch(() => {});
        throw new GulinError("invalid_content_type");
      }
      const raw = parseGulinDocument(await readJsonText(response));
      return { ok: true, status: "received_unvalidated", resource, receivedAt: now().toISOString(), raw };
    } catch (error) {
      if (controller.signal.aborted) return gulinFailure("connection_timeout", resource);
      if (error instanceof GulinError) return gulinFailure(error.status, resource);
      if (hasCertificateError(error)) return gulinFailure("tls_certificate_error", resource);
      return gulinFailure("network_error", resource);
    } finally {
      clearTimeout(timeout);
    }
  };
}

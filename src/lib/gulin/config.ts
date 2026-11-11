import "server-only";

import { GulinError } from "./errors";
import type { GulinEnvironment, GulinResource } from "./types";

const URL_ENV_NAMES: Record<GulinResource, string> = {
  values: "GULIN_VALUES_URL",
  groups: "GULIN_GROUPS_URL",
  configs: "GULIN_CONFIGS_URL",
};

export function getGulinUrl(
  resource: GulinResource,
  env: GulinEnvironment = process.env,
): URL {
  try {
    const rawUrl = env[URL_ENV_NAMES[resource]];
    const rawOrigin = env.GULIN_ALLOWED_ORIGIN;
    if (!rawUrl || !rawOrigin || rawUrl.length > 2048 || rawOrigin.length > 2048) {
      throw new GulinError("configuration_error");
    }
    const allowed = new URL(rawOrigin);
    const url = new URL(rawUrl);
    if (
      allowed.protocol !== "https:" ||
      allowed.pathname !== "/" ||
      allowed.username || allowed.password || allowed.search || allowed.hash ||
      url.protocol !== "https:" ||
      url.origin !== allowed.origin ||
      url.pathname !== "/api/sensors/" + resource ||
      url.username || url.password || url.search || url.hash
    ) {
      throw new GulinError("configuration_error");
    }
    return url;
  } catch {
    throw new GulinError("configuration_error");
  }
}

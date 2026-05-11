type ProxyFetchResult = {
  response: Response;
  usedProxy: boolean;
};

type EnvMap = Record<string, string | undefined>;
type LocationLike = { hostname?: string };

const DEFAULT_LOCAL_PROXY_URL = "http://127.0.0.1:8787";
const DEFAULT_LIVE_PROXY_URL = "https://worker.mickelsonmichael.workers.dev";

function getEnvironmentVariables(): EnvMap {
  const processObject = (globalThis as { process?: { env?: EnvMap } }).process;
  return processObject?.env ?? {};
}

function isTruthy(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function getCurrentLocation(): LocationLike {
  return (globalThis as { location?: LocationLike }).location ?? {};
}

function isWebRuntime(): boolean {
  const locationObject = (globalThis as { location?: LocationLike }).location;
  return Boolean(locationObject?.hostname);
}

function getCurrentHostname(): string {
  return String(getCurrentLocation().hostname ?? "")
    .trim()
    .toLowerCase();
}

function isLocalHostname(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0"
  );
}

async function fetchViaProxy(
  targetUrl: string,
  init?: RequestInit
): Promise<ProxyFetchResult | null> {
  const proxyUrl = buildProxyRequestUrl(targetUrl);
  if (!proxyUrl) {
    return null;
  }

  const response = await fetch(proxyUrl, {
    method: "GET",
    headers: init?.headers,
  });

  return { response, usedProxy: true };
}

export function getProxyBaseUrl(
  env: EnvMap = getEnvironmentVariables()
): string | null {
  if (!isWebRuntime()) {
    return null;
  }

  if (!isTruthy(env.EXPO_PUBLIC_FEED_PROXY_ENABLED ?? "true")) {
    return null;
  }

  const explicitUrl = env.EXPO_PUBLIC_FEED_PROXY_URL?.trim();
  if (explicitUrl) {
    return explicitUrl;
  }

  const configuredTarget =
    env.EXPO_PUBLIC_FEED_PROXY_TARGET?.trim().toLowerCase();
  const target =
    configuredTarget ||
    (isLocalHostname(getCurrentHostname()) ? "local" : "live");

  if (target === "local") {
    return (
      env.EXPO_PUBLIC_FEED_PROXY_LOCAL_URL ?? DEFAULT_LOCAL_PROXY_URL
    ).trim();
  }

  return (env.EXPO_PUBLIC_FEED_PROXY_LIVE_URL ?? DEFAULT_LIVE_PROXY_URL).trim();
}

export function buildProxyRequestUrl(
  targetUrl: string,
  env: EnvMap = getEnvironmentVariables()
): string | null {
  const proxyBaseUrl = getProxyBaseUrl(env);
  if (!proxyBaseUrl) {
    return null;
  }

  try {
    const proxyUrl = new URL(proxyBaseUrl);
    proxyUrl.searchParams.set("url", targetUrl);
    return proxyUrl.toString();
  } catch {
    return null;
  }
}

export function proxiedImageUrl(
  url: string,
  useProxy?: boolean,
  env?: EnvMap
): string;
export function proxiedImageUrl(
  url: null | undefined,
  useProxy?: boolean,
  env?: EnvMap
): null;
export function proxiedImageUrl(
  url: string | null | undefined,
  useProxy?: boolean,
  env?: EnvMap
): string | null;
export function proxiedImageUrl(
  url: string | null | undefined,
  useProxy?: boolean,
  env: EnvMap = getEnvironmentVariables()
): string | null {
  if (!url) {
    return null;
  }
  if (!useProxy) {
    return url;
  }
  return buildProxyRequestUrl(url, env) ?? url;
}

// Returns the worker base URL on all platforms — unlike getProxyBaseUrl, this
// doesn't short-circuit on native, because article extraction needs the worker
// regardless of platform (readability runs server-side).
function getWorkerBaseUrl(env: EnvMap = getEnvironmentVariables()): string {
  const explicitUrl = env.EXPO_PUBLIC_FEED_PROXY_URL?.trim();
  if (explicitUrl) return explicitUrl;

  const configuredTarget =
    env.EXPO_PUBLIC_FEED_PROXY_TARGET?.trim().toLowerCase();
  const isLocal =
    configuredTarget === "local" ||
    (isWebRuntime() && isLocalHostname(getCurrentHostname()));

  if (isLocal) {
    return (
      env.EXPO_PUBLIC_FEED_PROXY_LOCAL_URL ?? DEFAULT_LOCAL_PROXY_URL
    ).trim();
  }

  return (env.EXPO_PUBLIC_FEED_PROXY_LIVE_URL ?? DEFAULT_LIVE_PROXY_URL).trim();
}

export async function extractArticleContent(
  articleUrl: string
): Promise<string> {
  const workerBase = getWorkerBaseUrl();
  const extractUrl = new URL(workerBase);
  extractUrl.pathname = "/extract";
  extractUrl.searchParams.set("url", articleUrl);

  const response = await fetch(extractUrl.toString());

  if (response.status === 422) {
    throw new Error("Could not extract readable content from this page.");
  }
  if (!response.ok) {
    throw new Error(`Extraction failed with status ${response.status}.`);
  }

  const data = (await response.json()) as { content?: string };
  if (!data.content) {
    throw new Error("No content was extracted from this page.");
  }
  return data.content;
}

export function isLikelyCorsBlockedError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("failed to fetch") ||
    message.includes("network request failed") ||
    message.includes("load failed") ||
    message.includes("cors")
  );
}

export async function fetchWithProxyFallback(
  targetUrl: string,
  init?: RequestInit,
  forceProxy?: boolean
): Promise<ProxyFetchResult> {
  if (forceProxy) {
    const proxied = await fetchViaProxy(targetUrl, init);
    if (proxied) {
      return proxied;
    }
    // Proxy not configured — fall through to direct fetch
  }

  try {
    const response = await fetch(targetUrl, init);
    return { response, usedProxy: false };
  } catch (error) {
    const proxied = await fetchViaProxy(targetUrl, init);
    if (!proxied) {
      throw error;
    }

    return proxied;
  }
}

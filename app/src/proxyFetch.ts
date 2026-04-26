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

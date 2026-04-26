const ALLOWED_ORIGIN = "https://michaelmickelson.com";
const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

const environment = String(process.env.ENVIRONMENT ?? "").toLowerCase();
const isRunningLocally = environment === "dev";

if (isRunningLocally) {
	console.warn("⚠️ Running in local development mode. Hostname checks are disabled.");
}

const isBlockedHostname = (hostname: string): boolean => {
  if (isRunningLocally) {
    return false;
  }

  return (
    hostname === "localhost" ||
    hostname === "0.0.0.0" ||
    hostname === "::1" ||
    hostname.startsWith("127.") ||
    hostname.startsWith("192.168.") ||
    hostname.startsWith("10.")
  );
};

const worker: ExportedHandler<Env> = {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {

    // Only allow GET requests
    if (request.method !== "GET") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    // Check origin/referer
    const origin = request.headers.get("origin") ?? "";
    const referer = request.headers.get("referer") ?? "";
    if (!isRunningLocally && !origin.startsWith(ALLOWED_ORIGIN) && !referer.startsWith(ALLOWED_ORIGIN)) {
      return new Response("Forbidden", { status: 403 });
    }

    // Get target URL from query param: ?url=https://example.com/feed.xml
    const { searchParams } = new URL(request.url);
    const target = searchParams.get("url");

    if (!target) {
      return new Response("Missing url parameter", { status: 400 });
    }

    // Validate it's a real URL and uses http/https
    let parsed: URL;
    try {
      parsed = new URL(target);
    } catch {
      return new Response("Invalid URL", { status: 400 });
    }

    if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
      return new Response("Protocol not allowed", { status: 400 });
    }

    // Block requests to internal/private addresses
    if (isBlockedHostname(parsed.hostname)) {
      return new Response("Target not allowed", { status: 400 });
    }

    // Fetch the target
    let response: Response;
    try {
      response = await fetch(target, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; RSSReader/1.0)",
          "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
        },
        redirect: "follow",
      });
    } catch {
      return new Response("Failed to fetch target", { status: 502 });
    }

    // Stream the response back with CORS headers added
    const newHeaders = new Headers(response.headers);
    newHeaders.set("Access-Control-Allow-Origin", isRunningLocally ? "*" : ALLOWED_ORIGIN);
    newHeaders.set("Access-Control-Allow-Methods", "GET");

    return new Response(response.body, {
      status: response.status,
      headers: newHeaders,
    });
  },
};

export default worker;
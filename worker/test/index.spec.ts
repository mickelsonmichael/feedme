import {
	env,
	createExecutionContext,
	waitOnExecutionContext,
} from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index";

const ALLOWED_ORIGIN = "https://michaelmickelson.com";

const makeRequest = (
	url: string,
	init?: RequestInit,
): Request<unknown, IncomingRequestCfProperties> => {
	return new Request(url, init) as Request<unknown, IncomingRequestCfProperties>;
};

const runFetch = async (
	request: Request<unknown, IncomingRequestCfProperties>,
	runtimeEnv: Env = env as Env,
): Promise<Response> => {
	const ctx = createExecutionContext();
	const response = await worker.fetch!(request, runtimeEnv, ctx);
	await waitOnExecutionContext(ctx);
	return response;
};

describe("RSS proxy worker", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("returns 405 for non-GET requests", async () => {
		// Arrange
		const request = makeRequest("https://proxy.test/?url=https://example.com/feed.xml", {
			method: "POST",
		});

		// Act
		const response = await runFetch(request);

		// Assert
		expect(response.status).toBe(405);
		expect(await response.text()).toBe("Method Not Allowed");
	});

	it("returns 403 when origin and referer are not allowed", async () => {
		// Arrange
		const request = makeRequest("https://proxy.test/?url=https://example.com/feed.xml");

		// Act
		const response = await runFetch(request);

		// Assert
		expect(response.status).toBe(403);
		expect(await response.text()).toBe("Forbidden");
	});

	it("returns 400 when url parameter is missing", async () => {
		// Arrange
		const request = makeRequest("https://proxy.test/", {
			headers: { origin: ALLOWED_ORIGIN },
		});

		// Act
		const response = await runFetch(request);

		// Assert
		expect(response.status).toBe(400);
		expect(await response.text()).toBe("Missing url parameter");
	});

	it("returns 400 for invalid target URLs", async () => {
		// Arrange
		const request = makeRequest("https://proxy.test/?url=not-a-url", {
			headers: { origin: ALLOWED_ORIGIN },
		});

		// Act
		const response = await runFetch(request);

		// Assert
		expect(response.status).toBe(400);
		expect(await response.text()).toBe("Invalid URL");
	});

	it("returns 400 for localhost/private targets", async () => {
		// Arrange
		const request = makeRequest("https://proxy.test/?url=http://localhost/feed.xml", {
			headers: { origin: ALLOWED_ORIGIN },
		});

		// Act
		const response = await runFetch(request);

		// Assert
		expect(response.status).toBe(400);
		expect(await response.text()).toBe("Target not allowed");
	});

	it("allows localhost/private targets when running in local env", async () => {
		// Arrange
		const upstreamResponse = new Response("<rss />", {
			status: 200,
			headers: { "Content-Type": "application/rss+xml" },
		});
		const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(upstreamResponse);
		const request = makeRequest("https://proxy.test/?url=http://localhost/feed.xml", {
			headers: { origin: ALLOWED_ORIGIN },
		});
		const localEnv = { ...(env as Record<string, unknown>), LOCAL_DEV: "true" } as Env;

		// Act
		const response = await runFetch(request, localEnv);

		// Assert
		expect(fetchSpy).toHaveBeenCalledTimes(1);
		expect(fetchSpy).toHaveBeenCalledWith("http://localhost/feed.xml", expect.any(Object));
		expect(response.status).toBe(200);
		expect(await response.text()).toBe("<rss />");
	});

	it("forwards response and adds CORS headers", async () => {
		// Arrange
		const upstreamResponse = new Response("<rss />", {
			status: 200,
			headers: { "Content-Type": "application/rss+xml" },
		});
		const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(upstreamResponse);
		const request = makeRequest("https://proxy.test/?url=https://example.com/feed.xml", {
			headers: { origin: ALLOWED_ORIGIN },
		});

		// Act
		const response = await runFetch(request);

		// Assert
		expect(fetchSpy).toHaveBeenCalledTimes(1);
		expect(fetchSpy).toHaveBeenCalledWith("https://example.com/feed.xml", expect.any(Object));
		expect(response.status).toBe(200);
		expect(response.headers.get("Access-Control-Allow-Origin")).toBe(ALLOWED_ORIGIN);
		expect(response.headers.get("Access-Control-Allow-Methods")).toBe("GET");
		expect(await response.text()).toBe("<rss />");
	});
});

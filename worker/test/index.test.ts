import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { afterEach, describe, expect, it, vi } from 'vitest';

const ALLOWED_ORIGIN = 'https://michaelmickelson.com';

const makeRequest = (url: string, init?: RequestInit): Request<unknown, IncomingRequestCfProperties> => {
	return new Request(url, init) as Request<unknown, IncomingRequestCfProperties>;
};

const loadWorker = async (): Promise<ExportedHandler<Env>> => {
	vi.doUnmock('../src/utils');
	vi.resetModules();
	const module = await import('../src/index');
	return module.default;
};

const loadLocalWorker = async (): Promise<ExportedHandler<Env>> => {
	vi.resetModules();
	vi.doMock('../src/utils', async () => {
		const actual = await vi.importActual<typeof import('../src/utils')>('../src/utils');
		return {
			...actual,
			isRunningLocally: true,
			isRequestAllowed: () => true,
		};
	});

	const module = await import('../src/index');
	return module.default;
};

const runFetch = async (
	worker: ExportedHandler<Env>,
	request: Request<unknown, IncomingRequestCfProperties>,
	runtimeEnv: Env = env as Env,
): Promise<Response> => {
	const ctx = createExecutionContext();
	const response = await worker.fetch!(request, runtimeEnv, ctx);
	await waitOnExecutionContext(ctx);
	return response;
};

describe('RSS proxy worker', () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.resetModules();
		vi.doUnmock('../src/utils');
	});

	it('returns 405 for non-GET requests', async () => {
		// Arrange
		const worker = await loadWorker();
		const request = makeRequest('https://proxy.test/?url=https://example.com/feed.xml', {
			method: 'POST',
		});

		// Act
		const response = await runFetch(worker, request);

		// Assert
		expect(response.status).toBe(405);
		expect(await response.text()).toBe('Method Not Allowed');
	});

	it('responds to CORS preflight OPTIONS requests with 204 and CORS headers', async () => {
		// Arrange
		const worker = await loadWorker();
		const request = makeRequest('https://proxy.test/?url=https://example.com/feed.xml', {
			method: 'OPTIONS',
			headers: {
				origin: ALLOWED_ORIGIN,
				'Access-Control-Request-Headers': 'user-agent',
				'Access-Control-Request-Method': 'GET',
			},
		});

		// Act
		const response = await runFetch(worker, request);

		// Assert
		expect(response.status).toBe(204);
		expect(response.headers.get('Access-Control-Allow-Origin')).toBe(ALLOWED_ORIGIN);
		expect(response.headers.get('Access-Control-Allow-Methods')).toContain('GET');
		expect(response.headers.get('Access-Control-Allow-Methods')).toContain('OPTIONS');
		expect(response.headers.get('Access-Control-Allow-Headers')).toBe('user-agent');
	});

	it('returns 403 when origin and referer are not allowed', async () => {
		// Arrange
		const worker = await loadWorker();
		const request = makeRequest('https://proxy.test/?url=https://example.com/feed.xml');

		// Act
		const response = await runFetch(worker, request);

		// Assert
		expect(response.status).toBe(403);
		expect(await response.text()).toBe('Forbidden');
	});

	it('returns 400 when url parameter is missing', async () => {
		// Arrange
		const worker = await loadWorker();
		const request = makeRequest('https://proxy.test/', {
			headers: { origin: ALLOWED_ORIGIN },
		});

		// Act
		const response = await runFetch(worker, request);

		// Assert
		expect(response.status).toBe(400);
		expect(await response.text()).toBe('Missing url parameter');
	});

	it('returns 400 for invalid target URLs', async () => {
		// Arrange
		const worker = await loadWorker();
		const request = makeRequest('https://proxy.test/?url=not-a-url', {
			headers: { origin: ALLOWED_ORIGIN },
		});

		// Act
		const response = await runFetch(worker, request);

		// Assert
		expect(response.status).toBe(400);
		expect(await response.text()).toBe('Invalid URL');
	});

	it('returns 400 for localhost/private targets', async () => {
		// Arrange
		const worker = await loadWorker();
		const request = makeRequest('https://proxy.test/?url=http://localhost/feed.xml', {
			headers: { origin: ALLOWED_ORIGIN },
		});

		// Act
		const response = await runFetch(worker, request);

		// Assert
		expect(response.status).toBe(400);
		expect(await response.text()).toBe('Target not allowed');
	});

	it('allows requests without origin/referer when running in local env', async () => {
		// Arrange
		const worker = await loadLocalWorker();
		const upstreamResponse = new Response('<rss />', {
			status: 200,
			headers: { 'Content-Type': 'application/rss+xml' },
		});
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(upstreamResponse);
		const request = makeRequest('https://proxy.test/?url=https://example.com/feed.xml');

		// Act
		const response = await runFetch(worker, request);

		// Assert
		expect(fetchSpy).toHaveBeenCalledTimes(1);
		expect(fetchSpy).toHaveBeenCalledWith('https://example.com/feed.xml', expect.any(Object));
		expect(response.status).toBe(200);
		expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
		expect(await response.text()).toBe('<rss />');
	});

	it('forwards response and adds CORS headers', async () => {
		// Arrange
		const worker = await loadWorker();
		const upstreamResponse = new Response('<rss />', {
			status: 200,
			headers: { 'Content-Type': 'application/rss+xml' },
		});
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(upstreamResponse);
		const request = makeRequest('https://proxy.test/?url=https://example.com/feed.xml', {
			headers: { origin: ALLOWED_ORIGIN },
		});

		// Act
		const response = await runFetch(worker, request);

		// Assert
		expect(fetchSpy).toHaveBeenCalledTimes(1);
		expect(fetchSpy).toHaveBeenCalledWith('https://example.com/feed.xml', expect.any(Object));
		expect(response.status).toBe(200);
		expect(response.headers.get('Access-Control-Allow-Origin')).toBe(ALLOWED_ORIGIN);
		expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, OPTIONS');
		expect(await response.text()).toBe('<rss />');
	});
});

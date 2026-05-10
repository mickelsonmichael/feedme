import { isBlockedHostname, isRunningLocally, isRequestAllowed, getOriginAndReferrer } from './utils';

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

if (isRunningLocally) {
	console.warn('⚠️ Running in local development mode. Hostname checks are disabled.');
}

const worker: ExportedHandler<Env> = {
	async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
		// Handle CORS preflight requests so clients can send custom headers
		// (e.g. User-Agent on native) without breaking the proxy.
		if (request.method === 'OPTIONS') {
			const [preflightOrigin] = getOriginAndReferrer(request);
			const requestedHeaders = request.headers.get('Access-Control-Request-Headers') ?? '*';
			return new Response(null, {
				status: 204,
				headers: {
					'Access-Control-Allow-Origin': isRunningLocally ? '*' : preflightOrigin,
					'Access-Control-Allow-Methods': 'GET, OPTIONS',
					'Access-Control-Allow-Headers': requestedHeaders,
					'Access-Control-Max-Age': '86400',
					Vary: 'Origin',
				},
			});
		}

		// Only allow GET requests for the proxy itself
		if (request.method !== 'GET') {
			return new Response('Method Not Allowed', { status: 405 });
		}

		if (!isRequestAllowed(request)) {
			return new Response('Forbidden', { status: 403 });
		}

		const [origin] = getOriginAndReferrer(request);
		const allowOrigin = isRunningLocally ? '*' : origin;

		// Get target URL from query param: ?url=https://example.com/feed.xml
		const { searchParams } = new URL(request.url);
		const target = searchParams.get('url');

		if (!target) {
			return new Response('Missing url parameter', { status: 400 });
		}

		// Validate it's a real URL and uses http/https
		let parsed: URL;
		try {
			parsed = new URL(target);
		} catch {
			return new Response('Invalid URL', { status: 400 });
		}

		if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
			return new Response('Protocol not allowed', { status: 400 });
		}

		// Block requests to internal/private addresses
		if (isBlockedHostname(parsed.hostname)) {
			return new Response('Target not allowed', { status: 400 });
		}

		// Fetch the target, forwarding cache-validator headers so upstream can
		// reply with 304 Not Modified and skip sending an unchanged body.
		const upstreamHeaders: Record<string, string> = {
			'User-Agent': 'Mozilla/5.0 (compatible; RSSReader/1.0)',
			Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
		};
		const ifNoneMatch = request.headers.get('If-None-Match');
		if (ifNoneMatch) {
			upstreamHeaders['If-None-Match'] = ifNoneMatch;
		}
		const ifModifiedSince = request.headers.get('If-Modified-Since');
		if (ifModifiedSince) {
			upstreamHeaders['If-Modified-Since'] = ifModifiedSince;
		}

		let response: Response;
		try {
			response = await fetch(target, {
				headers: upstreamHeaders,
				redirect: 'follow',
			});
		} catch {
			return new Response('Failed to fetch target', { status: 502 });
		}

		console.log(`Proxied request to ${target} from origin ${origin}, response status: ${response.status}`);

		// Stream the response back with CORS headers added. CORS headers must be
		// applied to 304 responses too — without them browsers drop the response
		// and fail the request, defeating the conditional GET.
		const newHeaders = new Headers(response.headers);
		newHeaders.set('Access-Control-Allow-Origin', allowOrigin);
		newHeaders.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
		newHeaders.set('Vary', 'Origin');

		// 304 responses must not carry a body per RFC 9110 §15.4.5.
		const body = response.status === 304 ? null : response.body;

		return new Response(body, {
			status: response.status,
			headers: newHeaders,
		});
	},
};

export default worker;

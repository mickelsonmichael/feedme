export const ALLOWED_ORIGINS = [sanitizeUrl('https://michaelmickelson.com'), sanitizeUrl('https://www.michaelmickelson.com')];

export const isRunningLocally = String(process.env.ENVIRONMENT ?? '').toLowerCase() === 'dev';

export function sanitizeUrl(url: string): string {
	const trimmed = url.trimEnd();

	const lower = trimmed.toLowerCase();

	return lower.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
}

export function isRequestAllowed(request: Request): boolean {
	if (isRunningLocally) {
		return true;
	}

	const [origin, referer] = getOriginAndReferrer(request);

	// Requests with no origin and no referer come from non-browser clients (e.g.
	// native mobile apps). Browsers always add an Origin header on cross-origin
	// requests, so the absence of both headers means this isn't a rogue web page.
	if (!origin && !referer) {
		return true;
	}

	return ALLOWED_ORIGINS.some((allowed_origin) => origin.startsWith(allowed_origin) || referer.startsWith(allowed_origin));
}

export function isBlockedHostname(hostname: string): boolean {
	return (
		['localhost', '0.0.0.0', '::1'].includes(hostname) ||
		hostname.startsWith('127.') ||
		hostname.startsWith('192.168.') ||
		hostname.startsWith('10.')
	);
}

export function getOriginAndReferrer(request: Request): [string, string] {
	const origin = sanitizeUrl(request.headers.get('origin') ?? '');
	const referer = sanitizeUrl(request.headers.get('referer') ?? '');

	return [origin, referer];
}

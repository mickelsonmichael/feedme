#!/usr/bin/env node
/**
 * fetch-icon.js <site-url-or-icon-url>
 *
 * Given a site URL, discovers and verifies a usable favicon URL.
 * Given a direct image URL, verifies it is usable.
 *
 * "Usable" means:
 *   - HTTP 200
 *   - image/* Content-Type (not SVG — SVG is not supported by React Native Image)
 *   - Has an Access-Control-Allow-Origin header (required for web builds)
 *     OR is a known CORS-safe CDN (gravatar, githubusercontent, etc.)
 *     OR is not expected to be needed on web (flag --skip-cors to bypass)
 *
 * Candidate priority (highest → lowest):
 *   1. Direct URL passed when it already looks like an image path
 *   2. <link rel="icon" type="image/png"> from the site HTML
 *   3. <link rel="apple-touch-icon"> (always PNG, often works when favicon.ico doesn't)
 *   4. <link rel="icon"> / <link rel="shortcut icon"> (non-SVG only)
 *   5. <meta property="og:image"> (often hosted on CDNs with CORS *)
 *   6. WordPress blavatar on secure.gravatar.com (CORS *, only when the site has a registered blavatar)
 *   7. /favicon.ico
 *
 * Exit codes:
 *   0  – found a usable icon; prints the URL
 *   1  – no usable icon found
 *
 * Usage:
 *   node fetch-icon.js https://example.com
 *   node fetch-icon.js https://example.com/favicon.png
 *   node fetch-icon.js https://example.com --skip-cors
 */

const https = require('https');
const http = require('http');
const crypto = require('crypto');
const { URL } = require('url');

const TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 5;
const SKIP_CORS = process.argv.includes('--skip-cors');

// CDNs known to set CORS * on all assets
const CORS_SAFE_HOSTNAMES = [
  'secure.gravatar.com',
  'avatars.githubusercontent.com',
  'raw.githubusercontent.com',
  'cdn.jsdelivr.net',
  'unpkg.com',
  'cdn.cloudflare.steamstatic.com',
  'cdn.akamai.steamstatic.com',
];

function isCORSSafeHost(urlStr) {
  try {
    return CORS_SAFE_HOSTNAMES.includes(new URL(urlStr).hostname);
  } catch {
    return false;
  }
}

function request(urlStr, method = 'GET', redirectsLeft = MAX_REDIRECTS) {
  return new Promise((resolve, reject) => {
    if (redirectsLeft === 0) return reject(new Error('Too many redirects'));

    let parsed;
    try {
      parsed = new URL(urlStr);
    } catch {
      return reject(new Error(`Invalid URL: ${urlStr}`));
    }

    const lib = parsed.protocol === 'https:' ? https : http;
    const req = lib.request(
      urlStr,
      {
        method,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; feedme-agent/1.0)',
          Accept: 'image/*,text/html,*/*',
        },
        timeout: TIMEOUT_MS,
      },
      (res) => {
        const { statusCode, headers } = res;

        if ([301, 302, 303, 307, 308].includes(statusCode) && headers.location) {
          res.resume();
          const next = new URL(headers.location, urlStr).href;
          return resolve(request(next, method, redirectsLeft - 1));
        }

        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () =>
          resolve({
            statusCode,
            headers,
            url: urlStr,
            body: method === 'GET' ? Buffer.concat(chunks).toString('utf8') : '',
          }),
        );
        res.on('error', reject);
      },
    );

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Timed out after ${TIMEOUT_MS}ms`));
    });
    req.on('error', reject);
    req.end();
  });
}

async function tryIconUrl(url) {
  try {
    const res = await request(url, 'HEAD');
    if (res.statusCode !== 200) return null;
    const ct = (res.headers['content-type'] || '').toLowerCase();
    if (!ct.startsWith('image/')) return null;
    if (ct.includes('svg')) return null; // SVG not supported by React Native Image
    const cors = res.headers['access-control-allow-origin'];
    const corsOk = SKIP_CORS || cors === '*' || !!cors || isCORSSafeHost(url);
    return { url: res.url || url, contentType: ct, cors: cors || null, corsOk };
  } catch {
    return null;
  }
}

const HTML_FETCH_MAX_BYTES = 32_768; // 32 KB is enough to find all <head> tags

/** Like request('GET') but stops reading after maxBytes to avoid downloading huge pages. */
function requestLimited(urlStr, maxBytes, redirectsLeft = MAX_REDIRECTS) {
  return new Promise((resolve, reject) => {
    if (redirectsLeft === 0) return reject(new Error('Too many redirects'));

    let parsed;
    try {
      parsed = new URL(urlStr);
    } catch {
      return reject(new Error(`Invalid URL: ${urlStr}`));
    }

    const lib = parsed.protocol === 'https:' ? https : http;
    const req = lib.request(
      urlStr,
      {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; feedme-agent/1.0)',
          Accept: 'text/html,*/*',
        },
        timeout: TIMEOUT_MS,
      },
      (res) => {
        const { statusCode, headers } = res;

        if ([301, 302, 303, 307, 308].includes(statusCode) && headers.location) {
          res.resume();
          const next = new URL(headers.location, urlStr).href;
          return resolve(requestLimited(next, maxBytes, redirectsLeft - 1));
        }

        const chunks = [];
        let bytesRead = 0;
        let settled = false;

        const finish = () => {
          if (settled) return;
          settled = true;
          resolve({ statusCode, headers, url: urlStr, body: Buffer.concat(chunks).toString('utf8') });
        };

        res.on('data', (c) => {
          if (settled) return;
          chunks.push(c);
          bytesRead += c.length;
          if (bytesRead >= maxBytes) res.destroy();
        });
        res.on('end', finish);
        res.on('close', finish);
        res.on('error', (e) => { if (!settled) reject(e); });
      },
    );

    req.on('timeout', () => { req.destroy(); reject(new Error(`Timed out after ${TIMEOUT_MS}ms`)); });
    req.on('error', reject);
    req.end();
  });
}

function extractIconCandidates(html, baseUrl) {
  const candidates = [];

  // Helper to resolve a possibly-relative href and decode HTML entities
  const resolve = (href) => {
    try {
      // Decode common HTML entities in href values (e.g. &#038; → &)
      const decoded = href
        .replace(/&#0*38;/g, '&')
        .replace(/&amp;/gi, '&')
        .replace(/&#0*60;/g, '<')
        .replace(/&#0*62;/g, '>');
      return new URL(decoded, baseUrl).href;
    } catch {
      return null;
    }
  };

  // Match all <link> tags
  const linkRe = /<link([^>]+)>/gi;
  let m;
  while ((m = linkRe.exec(html)) !== null) {
    const attrs = m[1];
    const relM = /\brel=["']([^"']+)["']/i.exec(attrs);
    const hrefM = /\bhref=["']([^"']+)["']/i.exec(attrs);
    const typeM = /\btype=["']([^"']+)["']/i.exec(attrs);
    if (!relM || !hrefM) continue;

    const rel = relM[1].toLowerCase();
    const href = resolve(hrefM[1]);
    if (!href) continue;
    const type = typeM ? typeM[1].toLowerCase() : '';

    if (rel.includes('apple-touch-icon')) {
      candidates.push({ href, priority: 2 }); // always PNG
    } else if (rel.includes('icon') || rel.includes('shortcut icon')) {
      if (type.includes('svg')) continue; // skip SVG
      candidates.push({ href, priority: type.includes('png') ? 1 : 3 });
    }
  }

  // Extract og:image as a lower-priority fallback (often on CDNs with CORS *)
  const ogRe = /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i;
  const ogAlt = /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i;
  const ogM = ogRe.exec(html) || ogAlt.exec(html);
  if (ogM) {
    const href = resolve(ogM[1]);
    if (href) candidates.push({ href, priority: 4 });
  }

  // Sort: lower priority number = try first
  candidates.sort((a, b) => a.priority - b.priority);
  return candidates.map((c) => c.href);
}

async function blavatarUrl(host) {
  // WordPress sites expose a favicon via Gravatar's blavatar service (CORS *).
  // Use d=404 to confirm one actually exists before returning the URL;
  // otherwise the service returns a generic default that won't resemble the site.
  const hash = crypto.createHash('md5').update(host).digest('hex');
  const url = `https://secure.gravatar.com/blavatar/${hash}?s=64`;
  try {
    const probe = await request(`${url}&d=404`, 'HEAD');
    return probe.statusCode === 200 ? url : null;
  } catch {
    return null;
  }
}

async function main() {
  const inputArg = process.argv[2];
  if (!inputArg) {
    console.error('Usage: node fetch-icon.js <site-url-or-icon-url> [--skip-cors]');
    process.exit(1);
  }

  // Normalise: assume https if no protocol
  const input = inputArg.startsWith('http') ? inputArg : `https://${inputArg}`;

  let parsed;
  try {
    parsed = new URL(input);
  } catch {
    console.error(`FAIL: Invalid URL "${input}"`);
    process.exit(1);
  }

  const origin = `${parsed.protocol}//${parsed.host}`;

  // If the path looks like a direct image, skip HTML discovery.
  // Also treat any URL from a known image CDN as a direct image (e.g. GitHub avatars).
  const looksLikeImage =
    /\.(png|ico|jpg|jpeg|gif|webp|avif)(\?|$)/i.test(parsed.pathname) ||
    isCORSSafeHost(input);

  const queue = [];

  if (looksLikeImage) {
    queue.push(input);
  } else {
    // Fetch site HTML to extract <link> icon tags and og:image
    try {
      const res = await requestLimited(input, HTML_FETCH_MAX_BYTES);
      if (res.statusCode === 200) {
        queue.push(...extractIconCandidates(res.body, input));
      }
    } catch {
      // HTML fetch failed; fall through to fallbacks
    }
  }

  // Fallbacks always appended (deduped below)
  const blavatar = await blavatarUrl(parsed.host);
  if (blavatar) queue.push(blavatar);
  queue.push(`${origin}/favicon.ico`);

  // Dedupe while preserving order
  const seen = new Set();
  const deduped = queue.filter((u) => {
    if (seen.has(u)) return false;
    seen.add(u);
    return true;
  });

  console.log(`Checking ${deduped.length} candidate(s)...`);

  for (const candidate of deduped) {
    process.stdout.write(`  ${candidate} ... `);
    const result = await tryIconUrl(candidate);

    if (!result) {
      console.log('skip (not a valid image or request failed)');
      continue;
    }

    if (!result.corsOk) {
      console.log(
        `skip (no CORS header — will be blocked on web; use --skip-cors to allow)`,
      );
      continue;
    }

    console.log(`OK (${result.contentType}, cors: ${result.cors ?? 'not set but CORS-safe host'})`);
    console.log(`\nBEST ICON URL:\n${result.url}`);
    process.exit(0);
  }

  console.error('\nFAIL: No usable icon found among candidates.');
  process.exit(1);
}

main();

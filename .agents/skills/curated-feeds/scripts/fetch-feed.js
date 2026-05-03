#!/usr/bin/env node
/**
 * fetch-feed.js <url>
 *
 * Verifies that a URL is a valid RSS or Atom feed.
 *
 * Exit codes:
 *   0  – valid feed
 *   1  – invalid / unreachable feed (details printed to stderr)
 *
 * Usage:
 *   node fetch-feed.js https://example.com/rss.xml
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');

const TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 5;
const MAX_BYTES = 4_096; // only need the start of the document

const FEED_CONTENT_TYPES = ['xml', 'rss', 'atom', 'json'];
const FEED_START_PATTERNS = [/^\s*<\?xml/, /^\s*<rss/, /^\s*<feed/, /^\s*<channel/];

function get(urlStr, redirectsLeft = MAX_REDIRECTS) {
  return new Promise((resolve, reject) => {
    if (redirectsLeft === 0) return reject(new Error('Too many redirects'));

    let parsed;
    try {
      parsed = new URL(urlStr);
    } catch {
      return reject(new Error(`Invalid URL: ${urlStr}`));
    }

    const lib = parsed.protocol === 'https:' ? https : http;
    const req = lib.get(
      urlStr,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; feedme-agent/1.0)',
          Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
        },
        timeout: TIMEOUT_MS,
      },
      (res) => {
        const { statusCode, headers } = res;

        // Follow redirects
        if ([301, 302, 303, 307, 308].includes(statusCode) && headers.location) {
          res.resume();
          const next = new URL(headers.location, urlStr).href;
          return resolve(get(next, redirectsLeft - 1));
        }

        if (statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${statusCode}`));
        }

        const contentType = (headers['content-type'] || '').toLowerCase();
        const chunks = [];
        let bytesRead = 0;
        let settled = false;

        const finish = () => {
          if (settled) return;
          settled = true;
          resolve({ statusCode, contentType, body: Buffer.concat(chunks).toString('utf8') });
        };

        res.on('data', (chunk) => {
          if (settled) return;
          bytesRead += chunk.length;
          chunks.push(chunk);
          if (bytesRead >= MAX_BYTES) {
            res.destroy(); // stop streaming; 'close' will fire
          }
        });

        res.on('end', finish);
        res.on('close', finish);
        res.on('error', (err) => {
          if (!settled) reject(err);
        });
      },
    );

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Timed out after ${TIMEOUT_MS}ms`));
    });

    req.on('error', reject);
  });
}

async function main() {
  const url = process.argv[2];
  if (!url) {
    console.error('Usage: node fetch-feed.js <url>');
    process.exit(1);
  }

  let result;
  try {
    result = await get(url);
  } catch (err) {
    console.error(`FAIL: ${err.message}`);
    process.exit(1);
  }

  const { statusCode, contentType, body } = result;
  const snippet = body.substring(0, 300).replace(/\s+/g, ' ').trim();

  const hasXmlContentType = FEED_CONTENT_TYPES.some((t) => contentType.includes(t));
  const looksLikeFeed = FEED_START_PATTERNS.some((p) => p.test(body));

  if (!hasXmlContentType && !looksLikeFeed) {
    console.error(`FAIL: Content-Type "${contentType}" and body do not look like a feed.`);
    console.error(`Body snippet: ${snippet}`);
    process.exit(1);
  }

  console.log(`OK`);
  console.log(`Status    : ${statusCode}`);
  console.log(`Content-Type: ${contentType}`);
  console.log(`Snippet   : ${snippet}`);
  process.exit(0);
}

main();

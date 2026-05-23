#!/usr/bin/env node
/**
 * Mutable RSS feed server for end-to-end testing of FeedMe's background
 * notification pipeline.
 *
 * Zero dependencies — uses only Node's built-in `http` module.
 *
 * Endpoints
 * ---------
 *   GET  /feed.xml          Current RSS 2.0 feed (mutable; updated by /add)
 *   GET  /                  Human-readable status page (current items)
 *   POST /add               Append a new item. JSON body:
 *                             { "title": string, "content"?: string }
 *                           If omitted, an auto-generated item is appended.
 *   POST /reset             Clear all items and start over.
 *   GET  /healthz           "ok"
 *
 * Reaching the server from an Android emulator
 * --------------------------------------------
 * The host machine is reachable from the Android emulator at the special
 * address `10.0.2.2`. Use that in the feed URL you add to FeedMe, e.g.:
 *
 *   http://10.0.2.2:8799/feed.xml
 *
 * On a physical device on the same Wi-Fi network, use the host's LAN IP.
 *
 * Usage
 * -----
 *   node scripts/test-background-notifications/server.mjs [--port 8799]
 *
 * Then trigger a new post from a second terminal:
 *
 *   curl -X POST http://127.0.0.1:8799/add \
 *     -H "Content-Type: application/json" \
 *     -d "{\"title\":\"Hello from the test feed\"}"
 */

import http from "node:http";

const args = process.argv.slice(2);
const portIndex = args.indexOf("--port");
const PORT =
  portIndex >= 0 && args[portIndex + 1]
    ? Number(args[portIndex + 1])
    : Number(process.env.PORT ?? 8799);

const FEED_TITLE = "FeedMe Background-Sync Test Feed";
const FEED_LINK = `http://127.0.0.1:${PORT}/`;
const FEED_DESCRIPTION =
  "Synthetic RSS feed used to verify background-sync and notification delivery.";

/** @type {{ id: number, title: string, content: string, pubDate: Date }[]} */
const items = [];
let nextId = 1;

function seedInitialItem() {
  items.push({
    id: nextId++,
    title: "Initial post",
    content: "This post existed before the app was closed.",
    pubDate: new Date(),
  });
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function renderFeed() {
  const rssItems = items
    .slice()
    .sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime())
    .map((item) => {
      const guid = `${FEED_LINK}item/${item.id}`;
      return `    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${escapeXml(guid)}</link>
      <guid isPermaLink="false">${escapeXml(guid)}</guid>
      <pubDate>${item.pubDate.toUTCString()}</pubDate>
      <description>${escapeXml(item.content)}</description>
    </item>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeXml(FEED_TITLE)}</title>
    <link>${escapeXml(FEED_LINK)}</link>
    <description>${escapeXml(FEED_DESCRIPTION)}</description>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${rssItems}
  </channel>
</rss>
`;
}

function renderStatus() {
  const rows = items
    .slice()
    .sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime())
    .map(
      (item) =>
        `  <li><strong>#${item.id}</strong> [${item.pubDate.toISOString()}] ${escapeXml(item.title)}</li>`
    )
    .join("\n");
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeXml(FEED_TITLE)}</title></head>
<body style="font-family: ui-monospace, monospace; padding: 24px; max-width: 720px;">
  <h1>${escapeXml(FEED_TITLE)}</h1>
  <p><a href="/feed.xml">/feed.xml</a> &middot; ${items.length} item(s)</p>
  <ul>
${rows}
  </ul>
  <h2>Add an item</h2>
  <pre>curl -X POST http://127.0.0.1:${PORT}/add \\
  -H "Content-Type: application/json" \\
  -d '{"title":"New post"}'</pre>
</body></html>`;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);

  // Permissive CORS for browser-based testing of /add.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "GET" && url.pathname === "/feed.xml") {
    console.log(
      `[fetch] /feed.xml from ${req.socket.remoteAddress} (${items.length} items)`
    );
    res.writeHead(200, {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(renderFeed());
    return;
  }

  if (req.method === "GET" && url.pathname === "/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(renderStatus());
    return;
  }

  if (req.method === "GET" && url.pathname === "/healthz") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
    return;
  }

  if (req.method === "POST" && url.pathname === "/add") {
    let body;
    try {
      body = await readJsonBody(req);
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "invalid_json" }));
      return;
    }
    const id = nextId++;
    const item = {
      id,
      title:
        typeof body.title === "string" && body.title.length > 0
          ? body.title
          : `Auto-generated post #${id}`,
      content:
        typeof body.content === "string"
          ? body.content
          : `Body for post #${id}, published at ${new Date().toISOString()}.`,
      pubDate: new Date(),
    };
    items.push(item);
    console.log(`[add] #${item.id} ${item.title}`);
    res.writeHead(201, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, item }));
    return;
  }

  if (req.method === "POST" && url.pathname === "/reset") {
    items.length = 0;
    nextId = 1;
    seedInitialItem();
    console.log("[reset] feed cleared");
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, count: items.length }));
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("not found");
});

seedInitialItem();

server.listen(PORT, "0.0.0.0", () => {
  console.log(
    `Fake RSS server listening on http://0.0.0.0:${PORT} (Android emulator: http://10.0.2.2:${PORT}/feed.xml)`
  );
});

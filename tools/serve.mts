#!/usr/bin/env node
// Serve the repo so the gallery can load the effects as modules: node build-tools/tools/serve.mjs [port]
// then open http://localhost:8080/gallery/

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, normalize, sep } from "node:path";
import { ROOT } from "./lib/fxlib.mjs";

const PORT = +(process.argv[2] ?? 8080);
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".png": "image/png", ".gif": "image/gif",
  ".svg": "image/svg+xml", ".woff2": "font/woff2", ".ttf": "font/ttf", ".md": "text/plain; charset=utf-8", ".txt": "text/plain; charset=utf-8", ".mp4": "video/mp4",
};

createServer(async (req, res) => {
  let path;
  try { path = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname); }
  catch { return res.writeHead(400).end("잘못된 요청"); }
  if (path === "/") return res.writeHead(302, { location: "/gallery/" }).end();
  if (path.endsWith("/")) path += "index.html";
  if (path === "/gallery/app.js") path = "/build-gallery/app.js";
  if (path === "/gallery/3d.js") path = "/build-gallery/3d.js";
  const noticePaths: Record<string, string> = {
    "/gallery/LICENSE.txt": "/LICENSE", "/gallery/NOTICE.txt": "/NOTICE.md",
    "/gallery/HOLLOW-CROWN-LICENSE.txt": "/licenses/HOLLOW-CROWN.txt",
  };
  const isNotice = Object.hasOwn(noticePaths, path);
  if (isNotice) path = noticePaths[path];
  const file = normalize(join(ROOT, path));
  if (!file.startsWith(ROOT + sep)) return res.writeHead(403).end();
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": isNotice ? "text/plain; charset=utf-8" : TYPES[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" }).end(body);
  } catch {
    res.writeHead(404).end("찾을 수 없음");
  }
}).listen(PORT, "127.0.0.1", () => console.log(`갤러리: http://localhost:${PORT}/gallery/`));


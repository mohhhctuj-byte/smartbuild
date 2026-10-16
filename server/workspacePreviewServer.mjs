import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";

const [root, rawPort, apiTarget, manifestPath, buildRunId] = process.argv.slice(2);
const port = Number(rawPort);
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml" };
const MAX_PROXY_BODY_BYTES = 64 * 1024;
let previewPaths = null;
if (manifestPath) {
  try {
    const manifest = JSON.parse(readFileSync(path.resolve(root, manifestPath), "utf8"));
    previewPaths = new Set((manifest.files || []).filter(file => file.usedInPreview).map(file => file.path));
  } catch {
    previewPaths = new Set();
  }
}

function safePath(url) {
  const pathname = decodeURIComponent(new URL(url, "http://127.0.0.1").pathname);
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  if (relative.split("/").some(segment => segment.startsWith("."))) return null;
  if (previewPaths && !previewPaths.has(relative)) return null;
  const absolute = path.resolve(root, relative);
  if (!absolute.startsWith(`${path.resolve(root)}${path.sep}`) && absolute !== path.resolve(root)) return null;
  return absolute;
}

async function requestBody(req) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > MAX_PROXY_BODY_BYTES) throw new Error("Preview API request exceeds 64 KB.");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function proxyApi(req, res, pathname) {
  if (!apiTarget || pathname.startsWith("/api/__test__/")) {
    res.writeHead(404, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    return res.end(JSON.stringify({ detail: "Preview API route not found." }));
  }
  const body = ["GET", "HEAD"].includes(req.method || "GET") ? undefined : await requestBody(req);
  const allowedHeaders = {};
  if (typeof req.headers["content-type"] === "string") allowedHeaders["content-type"] = req.headers["content-type"];
  if (typeof req.headers["content-length"] === "string") allowedHeaders["content-length"] = req.headers["content-length"];
  const response = await fetch(new URL(req.url || "/", apiTarget), { method: req.method, headers: allowedHeaders, body });
  const contentType = response.headers.get("content-type") || "application/json; charset=utf-8";
  res.writeHead(response.status, { "content-type": contentType, "cache-control": "no-store" });
  res.end(Buffer.from(await response.arrayBuffer()));
}

createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url || "/", "http://127.0.0.1").pathname);
    if (pathname.startsWith("/api/")) return await proxyApi(req, res, pathname);
    const absolute = safePath(req.url || "/");
    if (!absolute) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      return res.end("Preview file not found.");
    }
    try {
      if (!(await stat(absolute)).isFile()) {
        res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        return res.end("Preview file not found.");
      }
    } catch (error) {
      if (error?.code === "ENOENT" || error?.code === "ENOTDIR") {
        res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        return res.end("Preview file not found.");
      }
      throw error;
    }
    res.writeHead(200, {
      "content-type": types[path.extname(absolute)] || "application/octet-stream",
      "cache-control": "no-store",
      ...(buildRunId ? { "x-smartbuild-build-run": buildRunId } : {}),
    });
    res.end(await readFile(absolute));
  } catch (error) {
    res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    res.end(error instanceof Error ? error.message : "Preview server failed.");
  }
}).listen(port, "127.0.0.1");

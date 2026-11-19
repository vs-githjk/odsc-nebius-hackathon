import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, sep, extname } from "node:path";
import trace from "../../../api/trace.ts";
import status from "../../../api/status.ts";

// Serve the built web app and the same Web handlers used by Vercel. Bind locally only.
const root = resolve("apps/web/dist");
const types: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json", ".woff2": "font/woff2" };
createServer(async (incoming, outgoing) => {
  const abort = new AbortController();
  outgoing.on("close", () => abort.abort());
  try {
    const url = new URL(incoming.url ?? "/", "http://localhost:3000");
    if (url.pathname === "/api/trace" || url.pathname === "/api/status") {
      const chunks: Buffer[] = []; let size = 0;
      for await (const chunk of incoming) {
        const bytes = Buffer.from(chunk); size += bytes.length;
        if (size > 8192) { outgoing.writeHead(400); outgoing.end("Invalid claim."); return; }
        chunks.push(bytes);
      }
      const headers = new Headers();
      for (const [key, value] of Object.entries(incoming.headers)) if (value) headers.set(key, Array.isArray(value) ? value.join(",") : value);
      headers.set("x-forwarded-for", incoming.socket.remoteAddress ?? "local");
      const method = incoming.method ?? "GET";
      const request = new Request(url, { method, headers, signal: abort.signal,
        ...(method === "GET" || method === "HEAD" ? {} : { body: Buffer.concat(chunks) }) });
      const response = await (url.pathname === "/api/trace" ? trace : status).fetch(request);
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      const reader = response.body?.getReader();
      if (reader) {
        try { while (!abort.signal.aborted) { const part = await reader.read(); if (part.done) break; outgoing.write(part.value); } }
        finally { await reader.cancel(); }
      }
      outgoing.end(); return;
    }
    const path = resolve(root, "." + decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname));
    if (!path.startsWith(root + sep)) { outgoing.writeHead(404); outgoing.end(); return; }
    const body = await readFile(path);
    outgoing.writeHead(200, { "Content-Type": types[extname(path)] ?? "application/octet-stream" }); outgoing.end(body);
  } catch {
    if (!outgoing.headersSent) outgoing.writeHead(500);
    outgoing.end("Request could not finish.");
  }
}).listen(3000, "127.0.0.1", () => console.log("Patient Zero: http://127.0.0.1:3000"));

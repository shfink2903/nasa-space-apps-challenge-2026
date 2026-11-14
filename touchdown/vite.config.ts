import { createReadStream, statSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

const here = fileURLToPath(new URL(".", import.meta.url));
const DATA_ROOT = resolve(here, "../data/processed/v1");

/**
 * Serves the frozen dataset at /data/v1/* straight from the repository.
 * No Content-Encoding header is set, so the browser receives the raw gzip
 * bytes of the series files and can decode them with DecompressionStream.
 */
function serveDataset(): Plugin {
  const handler = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = (req.url ?? "").split("?")[0];
    if (!url.startsWith("/data/v1/")) return next();
    const file = resolve(DATA_ROOT, decodeURIComponent(url.slice("/data/v1/".length)));
    if (!file.startsWith(DATA_ROOT + sep)) {
      res.statusCode = 403;
      return res.end();
    }
    let size: number;
    try {
      const st = statSync(file);
      if (!st.isFile()) throw new Error("not a file");
      size = st.size;
    } catch {
      res.statusCode = 404;
      return res.end();
    }
    res.setHeader("Content-Type", file.endsWith(".json") ? "application/json" : "application/octet-stream");
    res.setHeader("Content-Length", size);
    res.setHeader("Cache-Control", "public, max-age=3600");
    createReadStream(file).pipe(res);
  };
  return {
    name: "serve-dataset",
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}

export default defineConfig({
  plugins: [serveDataset()],
  server: { host: "127.0.0.1", port: 5180, strictPort: true },
  preview: { host: "127.0.0.1", port: 5180, strictPort: true },
  build: { target: "es2022", chunkSizeWarningLimit: 900 },
});

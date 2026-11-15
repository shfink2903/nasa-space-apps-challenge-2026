import { createReadStream, statSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import { packageDataset } from "./scripts/dataset-build.ts";

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
    const path = decodeURIComponent(url.slice("/data/v1/".length));
    const file = resolve(DATA_ROOT, path.endsWith(".gz.bin") ? path.slice(0, -4) : path);
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
    async writeBundle(options) {
      const target = resolve(here, options.dir ?? "dist", "data/v1");
      const result = await packageDataset(DATA_ROOT, target);
      console.log(`Dataset bundled and SHA-256 verified: ${result.files} files, ${result.series} browser gzip copies.`);
    },
  };
}

export default defineConfig({
  // Relative asset paths: the build works at a domain root and under a sub-path (GitHub Pages project site).
  base: "./",
  plugins: [serveDataset()],
  // The optional AI service (python -m lunar_data.server) listens on 8001. Without it the app still works.
  server: { host: "127.0.0.1", port: 5180, strictPort: true, proxy: { "/api": "http://127.0.0.1:8001" } },
  preview: { host: "127.0.0.1", port: 5180, strictPort: true, proxy: { "/api": "http://127.0.0.1:8001" } },
  build: { target: "es2022", chunkSizeWarningLimit: 900 },
});

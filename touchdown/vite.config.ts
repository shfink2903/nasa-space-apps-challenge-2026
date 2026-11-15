import { createReadStream, readFileSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import { packageDataset } from "./scripts/dataset-build.ts";

const here = fileURLToPath(new URL(".", import.meta.url));
const DATASET_VERSION = process.env.LUNAR_DATASET_VERSION ?? "v1";
if (!/^v[\w.-]+$/.test(DATASET_VERSION)) throw new Error("Invalid LUNAR_DATASET_VERSION");
const DATA_ROOT = resolve(here, "../data/processed", DATASET_VERSION);
const DATA_URL = `/data/${DATASET_VERSION}/`;

/**
 * Serves the frozen dataset at /data/v1/* straight from the repository.
 * No Content-Encoding header is set, so the browser receives the raw gzip
 * bytes of the series files and can decode them with DecompressionStream.
 */
function serveDataset(): Plugin {
  const handler = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = (req.url ?? "").split("?")[0];
    if (!url.startsWith(DATA_URL)) return next();
    const path = decodeURIComponent(url.slice(DATA_URL.length));
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
      const output = resolve(here, options.dir ?? "dist");
      const target = resolve(output, "data", DATASET_VERSION);
      const sourceHash = createHash("sha256").update(readFileSync(resolve(DATA_ROOT, "manifest.json"))).digest("hex");
      const derived = JSON.parse(readFileSync(resolve(output, "derived", `${DATASET_VERSION}.json`), "utf8"));
      if (derived.datasetVersion !== DATASET_VERSION || derived.datasetManifestSha256 !== sourceHash) {
        throw new Error("Derived index does not match the selected dataset; run npm run prepare:derived");
      }
      const result = await packageDataset(DATA_ROOT, target);
      if (DATASET_VERSION.startsWith("v1.1-relief")) {
        const report = readFileSync(resolve(here, "../docs/validation/polar20-nominal-final.json"), "utf8");
        const checks = JSON.parse(report);
        const reference = resolve(here, "../data/processed", checks.datasetVersion, "manifest.json");
        const referenceHash = createHash("sha256").update(readFileSync(reference)).digest("hex");
        const checkedManifest = JSON.parse(readFileSync(reference, "utf8"));
        const selectedManifest = JSON.parse(readFileSync(resolve(DATA_ROOT, "manifest.json"), "utf8"));
        if (checks.numericalAcceptance !== "accepted" || checks.datasetManifestSha256 !== referenceHash
            || selectedManifest.terrainMethodId !== checkedManifest.terrainMethodId
            || selectedManifest.kernelSetId !== checkedManifest.kernelSetId
            || selectedManifest.refined !== checkedManifest.refined) {
          throw new Error("Relief numerical checks are missing, rejected, or stale");
        }
        writeFileSync(resolve(output, "relief-numerical-checks.json"), report);
      }
      writeFileSync(resolve(output, "dataset-version.json"), JSON.stringify({ datasetVersion: DATASET_VERSION, datasetManifestSha256: sourceHash }));
      console.log(`Dataset bundled and SHA-256 verified: ${result.files} files, ${result.series} browser gzip copies.`);
    },
  };
}

export default defineConfig({
  define: { "import.meta.env.LUNAR_DATASET_VERSION": JSON.stringify(DATASET_VERSION) },
  plugins: [serveDataset()],
  // The optional AI service (python -m lunar_data.server) listens on 8001. Without it the app still works.
  server: { host: "127.0.0.1", port: 5180, strictPort: true, proxy: { "/api": "http://127.0.0.1:8001" } },
  preview: { host: "127.0.0.1", port: 5180, strictPort: true, proxy: { "/api": "http://127.0.0.1:8001" } },
  build: { target: "es2022", chunkSizeWarningLimit: 900 },
});

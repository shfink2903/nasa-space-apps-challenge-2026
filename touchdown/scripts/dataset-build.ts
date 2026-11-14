import { createHash } from "node:crypto";
import { cp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";

interface Manifest {
  files: { path: string; sizeBytes: number; sha256: string }[];
}

export async function verifyDataset(source: string, target: string): Promise<{ files: number; series: number }> {
  const expected = await readFile(join(source, "manifest.json"));
  if (!(await readFile(join(target, "manifest.json"))).equals(expected))
    throw new Error("Build manifest differs from source dataset");
  const manifest: Manifest = JSON.parse(expected.toString());
  let series = 0;
  for (const entry of manifest.files) {
    const paths = [entry.path];
    if (entry.path.endsWith(".gz")) {
      paths.push(entry.path + ".bin");
      series++;
    }
    for (const path of paths) {
      const bytes = await readFile(join(target, path));
      if (bytes.length !== entry.sizeBytes || createHash("sha256").update(bytes).digest("hex") !== entry.sha256)
        throw new Error(`Build dataset integrity check failed: ${path}`);
    }
  }
  return { files: manifest.files.length, series };
}

/** Copy the frozen source, preserving it byte-for-byte, and fail incomplete builds. */
export async function packageDataset(source: string, target: string): Promise<{ files: number; series: number }> {
  const manifest: Manifest = JSON.parse(await readFile(join(source, "manifest.json"), "utf8"));
  await rm(target, { recursive: true, force: true });
  await cp(source, target, { recursive: true });
  for (const entry of manifest.files) {
    if (entry.path.endsWith(".gz"))
      await cp(join(target, entry.path), join(target, entry.path + ".bin"));
  }
  return verifyDataset(source, target);
}

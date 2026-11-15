import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";

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

/** Publish the manifest's frozen files only, preserving bytes and excluding local metadata. */
export async function packageDataset(source: string, target: string): Promise<{ files: number; series: number }> {
  const manifest: Manifest = JSON.parse(await readFile(join(source, "manifest.json"), "utf8"));
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
  await cp(join(source, "manifest.json"), join(target, "manifest.json"));
  for (const entry of manifest.files) {
    await mkdir(dirname(join(target, entry.path)), { recursive: true });
    await cp(join(source, entry.path), join(target, entry.path));
    if (entry.path.endsWith(".gz"))
      await cp(join(target, entry.path), join(target, entry.path + ".bin"));
  }
  return verifyDataset(source, target);
}

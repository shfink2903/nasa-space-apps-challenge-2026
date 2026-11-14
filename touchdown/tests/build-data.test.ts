import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { packageDataset, verifyDataset } from "../scripts/dataset-build";

async function fixture(run: (source: string, target: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "touchdown-build-"));
  try {
    const source = join(root, "source"), target = join(root, "dist/data/v1");
    await mkdir(join(source, "series"), { recursive: true });
    const bytes = Buffer.from([31, 139, 8, 0]);
    await writeFile(join(source, "series/example.json.gz"), bytes);
    await writeFile(join(source, "manifest.json"), JSON.stringify({ files: [{
      path: "series/example.json.gz", sizeBytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    }] }));
    await run(source, target);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

it("packages source data in a clean build with raw browser gzip copies", () => fixture(async (source, target) => {
  await packageDataset(source, target);
  expect(await readFile(join(target, "manifest.json"))).toEqual(await readFile(join(source, "manifest.json")));
  expect(await readFile(join(target, "series/example.json.gz.bin"))).toEqual(await readFile(join(source, "series/example.json.gz")));
}));

it("rejects a build with a missing dataset file", () => fixture(async (source, target) => {
  await packageDataset(source, target);
  await rm(join(target, "series/example.json.gz"));
  await expect(verifyDataset(source, target)).rejects.toThrow(/example.json.gz/);
}));

it("rejects altered browser gzip copies", () => fixture(async (source, target) => {
  await packageDataset(source, target);
  await writeFile(join(target, "series/example.json.gz.bin"), "broken");
  await expect(verifyDataset(source, target)).rejects.toThrow(/example.json.gz.bin/);
}));

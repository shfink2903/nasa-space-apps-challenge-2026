import { chromium, expect } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const base = process.env.PREVIEW_URL ?? "http://127.0.0.1:4180";
const data = new URL("../dist/data/v1/", import.meta.url);
const output = new URL("../.cache/", import.meta.url);
const json = async (path) => JSON.parse(await readFile(new URL(path, data), "utf8"));
const { sites } = await json("sites.json");
const report = { base, startedAt: new Date().toISOString(), checks: [], errors: [], failedDataRequests: [], pass: false };
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  channel: "chrome", headless: true,
  args: ["--enable-webgl", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" });
  page.on("pageerror", (error) => report.errors.push(error.message));
  page.on("response", (response) => {
    if (response.url().includes("/data/v1/") && !response.ok())
      report.failedDataRequests.push({ url: response.url(), status: response.status() });
  });
  await page.goto(base);
  await expect(page.locator("#loader")).toHaveCount(0, { timeout: 60000 });
  await expect(page.locator(".site-row")).toHaveCount(13);
  await expect(page.locator("#start-date option")).toHaveCount(52);
  report.checks.push("Boot, 13 sites and 52 start dates from the static build");
  const number = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const elevation = (value) => `${value < 0 ? "−" : "+"}${number.format(Math.abs(value))}°`;

  async function checkSite(site, date, index) {
    const candidates = site.scenarioIds.filter((id) => id.includes(`_${date}_30d_h2m_`));
    const id = candidates.find((id) => id.includes("_lola_")) ?? candidates[0];
    const scenario = await json(`scenarios/${id}.json`);
    const series = JSON.parse(gunzipSync(await readFile(new URL(scenario.seriesRef.path, data))).toString());
    await page.getByRole("button", { name: `Se poser à ${site.name}`, exact: true }).click();
    await expect(page.locator(".cond-site")).toHaveText(site.name.split(" – ")[0], { timeout: 30000 });
    await expect(page.locator("body")).toHaveAttribute("data-phase", "surface", { timeout: 30000 });
    await page.locator(".scrub-range").fill(String(index));
    await expect(page.locator(".cond-value").nth(0)).toHaveText(elevation(series.sunElDeg[index]));
    await expect(page.locator(".cond-value").nth(1)).toHaveText(elevation(series.earthElDeg[index]));
    const fraction = scenario.metrics.find((metric) => metric.metricId === "sun.anyDisk.fraction").value;
    await expect(page.locator(".cond-line b").last()).toHaveText(fraction === null ? "—" : `${number.format(fraction * 100)} %`);
    await expect(page.locator(".cond-model")).toContainText(scenario.modelLevel === "lola" ? "LOLA" : "géométrique");
    if (scenario.profileId)
      expect((await page.request.get(`${base}/data/v1/horizons/${site.id}_h2m_${scenario.profileId}.json`)).ok()).toBeTruthy();
    report.checks.push(`${site.id}, ${date}, sample ${index}: Sun/Earth elevations and solar fraction match delivered data (${scenario.modelLevel})`);
  }

  for (const site of sites) await checkSite(site, "20261201", 2160);
  await page.locator("#start-date").selectOption("20271123");
  const last = sites.at(-1);
  // Wait for the new date's series before checking its published values.
  await expect(page.locator(".clock-date")).toContainText("2027");
  await page.getByRole("button", { name: "Retour en orbite", exact: true }).click();
  await expect(page.locator("body")).toHaveAttribute("data-phase", "cruise", { timeout: 30000 });
  await checkSite(last, "20271123", 4320);
  await page.screenshot({ path: fileURLToPath(new URL("build-desktop.png", output)) });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: fileURLToPath(new URL("build-mobile.png", output)), fullPage: true });
  report.checks.push("Mobile layout fits viewport");
  expect(report.errors).toEqual([]);
  expect(report.failedDataRequests).toEqual([]);
  report.pass = true;
} finally {
  report.finishedAt = new Date().toISOString();
  await writeFile(new URL("build-browser-report.json", output), JSON.stringify(report, null, 2) + "\n");
  await browser.close();
}
console.log(JSON.stringify(report, null, 2));

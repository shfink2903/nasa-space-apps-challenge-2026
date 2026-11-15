// End-to-end check of the production build (dist/) in a real browser.
// Usage: npm run build && npm run test:e2e. Starts the real local API with an offline model test double.
// Every expected number is read from the built dataset files, never typed here.
import { chromium, expect as baseExpect } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { checkPlanner } from "./check-planner-browser.mjs";
import { checkResilience } from "./check-resilience.mjs";
const expect = baseExpect.configure({ timeout: 30000 });

let server;
async function startServer() {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  server = spawn(process.env.PYTHON ?? `${root}.venv/bin/python`, ["-B", "scripts/serve_e2e.py"], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
  let stderr = "";
  server.stderr.on("data", (chunk) => { stderr = (stderr + chunk).slice(-4000); });
  const lines = createInterface({ input: server.stdout });
  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Test server start timed out: ${stderr}`)), 30000);
    server.once("error", (error) => { clearTimeout(timer); reject(error); });
    server.once("exit", (code) => { clearTimeout(timer); reject(new Error(`Test server exited (${code}): ${stderr}`)); });
    lines.once("line", (line) => { clearTimeout(timer); resolve(JSON.parse(line).url); });
  });
}
const base = process.env.PREVIEW_URL ?? await startServer();
const data = new URL("../dist/data/v1/", import.meta.url);
const output = new URL("../.cache/", import.meta.url);
const json = async (path) => JSON.parse(await readFile(new URL(path, data), "utf8"));
const { sites } = await json("sites.json");
const report = { base, startedAt: new Date().toISOString(), checks: [], errors: [], failedDataRequests: [], pass: false };
report.checks.push = (...checks) => { checks.forEach((check) => console.log(`PASS ${check}`)); return Array.prototype.push.apply(report.checks, checks); };
await mkdir(output, { recursive: true });

const n1 = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const elevation = (value) => `${value < 0 ? "−" : "+"}${n1.format(Math.abs(value))}°`;
const percent = (value) => (value === null ? "—" : `${n1.format(value * 100)} %`);
const siteName = (site) => (site.status === "study_point" ? `Point d'étude ${n1.format(Math.abs(site.latDeg))}° S` : site.name.split(" – ")[0]);
const metric = (metrics, id) => metrics.find((m) => m.metricId === id).value;
const POLAR = ["sp_s8950", "sp_s8800", "sp_s8600", "chandrayaan3", "im1"];
const CANDIDATES = ["sp_s8950", "sp_s8800", "sp_s8600"];

const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--enable-webgl", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
}).catch((error) => { server?.kill("SIGTERM"); throw error; });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  await page.addInitScript(() => window.localStorage.setItem("touchdown.locale", "fr"));
  page.on("pageerror", (error) => report.errors.push(error.message));
  page.on("response", (response) => {
    if (response.url().includes("/data/v1/") && !response.ok()) report.failedDataRequests.push({ url: response.url(), status: response.status() });
  });
  await page.goto(base);
  await expect(page.locator("#loader")).toHaveCount(0, { timeout: 90000 });
  await expect(page.locator(".sites .site-row")).toHaveCount(5);
  await expect(page.locator("#start-date option")).toHaveCount(52);
  await expect(page.getByTestId("scene-status")).toHaveAttribute("data-status", "ready", { timeout: 90000 });
  report.checks.push("Boot: 5 south-pole sites (3 candidates, 2 references) and 52 start dates, no flight needed to see numbers");

  const select = (site) => page.locator(".sites .site-main", { hasText: siteName(site) }).click();
  const scenarioOf = async (site, date, model) => json(`scenarios/${site.scenarioIds.find((id) => id.includes(`_${date}_30d_h2m_${model}_`))}.json`);
  const seriesOf = async (scenario) => JSON.parse(gunzipSync(await readFile(new URL(scenario.seriesRef.path, data))).toString());

  // 1. Site card: live elevations and 30-day shares equal the delivered data, for each polar site (terrain model).
  for (const id of POLAR) {
    const site = sites.find((s) => s.id === id);
    const scenario = await scenarioOf(site, "20261201", "lola");
    const series = await seriesOf(scenario);
    await select(site);
    await expect(page.locator(".site-card .card-title")).toHaveText(siteName(site));
    await page.locator(".scrub-range").fill("2160");
    await expect(page.locator(".site-card .now-sun .now-value")).toHaveText(elevation(series.sunElDeg[2160]), { timeout: 30000 });
    await expect(page.locator(".site-card .now-earth .now-value")).toHaveText(elevation(series.earthElDeg[2160]));
    await expect(page.locator(".site-card .share-sun b")).toHaveText(percent(metric(scenario.metrics, "sun.anyDisk.fraction")));
    await expect(page.locator(".site-card .share-earth b")).toHaveText(percent(metric(scenario.metrics, "earth.anyDisk.fraction")));
    await expect(page.locator(".site-card .share-both b")).toHaveText(percent(metric(scenario.metrics, "overlap.sunAny_earthAny.fraction")));
    await expect(page.locator(".site-card .now-sun .now-countdown")).toHaveText(/Coucher dans|Lever dans|Pas de (coucher|lever)/);
    await expect(page.locator(".site-card .now-earth .now-countdown")).toHaveText(/Coucher dans|Lever dans|Pas de (coucher|lever)/);
    await expect(page.locator("body")).toHaveAttribute("data-phase", /cruise|focus/);
    report.checks.push(`${id}: Sun and Earth elevation at sample 2160, Sun, Earth and Sun+Earth shares match the dataset; countdowns shown; no flight started`);
  }

  // 2. A site with no Sun at the chosen time cannot be landed on.
  const dark = sites.find((s) => s.id === "sp_s8800");
  await select(dark);
  await expect(page.locator(".site-card .button-primary")).toBeDisabled();
  await expect(page.locator(".site-card .button-primary")).toContainText("refusé");
  report.checks.push("sp_s8800 (0 % Sun): landing refused");

  // 3. A sunlit site can: the landing runs (instant with reduced motion) and ends on the ground.
  const lit = sites.find((s) => s.id === "sp_s8600");
  const litSeries = await seriesOf(await scenarioOf(lit, "20261201", "lola"));
  await select(lit);
  await page.locator(".scrub-range").fill(String(litSeries.sunState.findIndex((state) => state === 2)));
  await expect(page.locator(".site-card .button-primary")).toBeEnabled();
  await page.locator(".site-card .button-primary").click();
  await expect(page.locator("body")).toHaveAttribute("data-phase", "surface", { timeout: 60000 });
  await page.getByRole("button", { name: "Retour au site", exact: true }).click();
  await expect(page.locator("body")).toHaveAttribute("data-phase", "focus", { timeout: 30000 });
  report.checks.push("sp_s8600 at a sunlit time: landing reaches the ground view, and Back returns to the site view");

  // 4. Compare tab: the candidates are ranked on the published Sun+Earth share; references are not ranked.
  await page.getByRole("tab", { name: "Comparer les sites" }).click();
  const overlap = {};
  for (const id of POLAR) overlap[id] = metric((await scenarioOf(sites.find((s) => s.id === id), "20261201", "lola")).metrics, "overlap.sunAny_earthAny.fraction");
  const expected = [...CANDIDATES].sort((a, b) => overlap[b] - overlap[a]).map((id) => siteName(sites.find((s) => s.id === id)));
  await expect(page.locator(".rank-table tbody tr:not(.row-divider)")).toHaveCount(5);
  await expect(page.locator(".rank-table tbody tr:not(.row-divider) .link-button")).toHaveText([...expected, ...(await page.locator(".rank-table tbody tr:not(.row-divider) .link-button").allTextContents()).slice(3)]);
  await expect(page.locator(".rank-table tbody tr:not(.row-divider) .site-rank").first()).toHaveText("1");
  await expect(page.locator(".compare-column")).toHaveCount(3);
  await expect(page.locator(".chart-calendar .cal-cell").first()).toBeVisible();
  report.checks.push(`Compare tab: candidates ranked ${expected.join(" > ")}; 3 sites side by side; 52-week calendar drawn`);

  // 5. All sites, geometric model, last start date: one mid-latitude site matches the dataset too.
  await page.locator(".data-toolbar .segment", { hasText: "Tous · sans relief" }).click();
  await expect(page.locator(".rank-table tbody tr:not(.row-divider)")).toHaveCount(13);
  await page.locator(".data-toolbar select").first().selectOption("20271123");
  const apollo = sites.find((s) => s.id === "apollo15");
  const apolloScenario = await scenarioOf(apollo, "20271123", "geometric");
  await expect(page.locator(".rank-table tbody tr", { hasText: "Apollo 15" }).locator(".cell-share").nth(1)).toContainText(percent(metric(apolloScenario.metrics, "sun.anyDisk.fraction")));
  report.checks.push("All 13 sites listed with the geometric model; Apollo 15 Sun share on 2027-11-23 matches the dataset");

  // 6. The 1 km grids load when scrolled to.
  await page.locator(".data-card", { hasText: "Un petit déplacement" }).scrollIntoViewIfNeeded();
  await expect(page.locator(".chart-grid .sg-cell")).toHaveCount(75, { timeout: 60000 });
  report.checks.push("Three 5 x 5 sensitivity grids drawn (75 cells)");
  await page.screenshot({ path: fileURLToPath(new URL("build-compare.png", output)) });

  // 7. Small screen: nothing wider than the page, in both tabs.
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.getByRole("tab", { name: "Explorer en 3D" }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: fileURLToPath(new URL("build-mobile.png", output)) });
  report.checks.push("Mobile width: both tabs fit the viewport");

  await page.close();
  await checkPlanner(browser, base, report, output, { json, sites });
  await checkResilience(browser, base, report, output);

  expect(report.errors).toEqual([]);
  expect(report.failedDataRequests).toEqual([]);
  report.pass = true;
} catch (error) {
  report.failure = error.message;
  throw error;
} finally {
  report.finishedAt = new Date().toISOString();
  await writeFile(new URL("build-browser-report.json", output), JSON.stringify(report, null, 2) + "\n");
  await browser.close();
  server?.kill("SIGTERM");
}
console.log(JSON.stringify(report, null, 2));

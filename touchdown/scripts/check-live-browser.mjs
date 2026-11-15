// Explicit paid smoke test. One browser question, conservative per-question budget $0.05.
// Never called by npm test or test:e2e. Run: node scripts/check-live-browser.mjs
import { chromium, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const output = new URL("../.cache/live-browser-report.json", import.meta.url);
const server = spawn(`${root}.venv/bin/python`, ["-B", "-m", "lunar_data.server", "--port", "0", "--dataset", "touchdown/dist/data/v1"], {
  cwd: root, stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, LUNAR_AI_MAX_COST_USD: "0.05", LUNAR_AI_HOURLY_COST_USD: "0.05" },
});
let browser;
const report = { startedAt: new Date().toISOString(), pass: false, requests: 0, errors: [], scope: "One real OpenRouter question through the production Touchdown browser and local API; scientific v1 unchanged" };
try {
  const base = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Local live server startup timeout")), 30000);
    server.once("error", (error) => { clearTimeout(timer); reject(error); });
    server.once("exit", (code) => { clearTimeout(timer); reject(new Error(`Local server exited: ${code}`)); });
    createInterface({ input: server.stdout }).once("line", (line) => { clearTimeout(timer); resolve(line.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0]); });
  });
  if (!base) throw new Error("No local server URL");
  browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
  await page.addInitScript(() => localStorage.setItem("touchdown.locale", "fr"));
  // The live-provider check is independent of GPU performance; the offline suite tests the full scene.
  await page.route("**/models/starship.glb", (route) => route.fulfill({ status: 404, body: "Live-provider test: data mode" }));
  page.on("pageerror", (error) => report.errors.push(error.message));
  page.on("request", (request) => { if (request.url().endsWith("/api/ai/chat")) report.requests++; });
  await page.goto(base);
  await expect(page.locator("body")).toHaveAttribute("data-tab", "data", { timeout: 60000 });
  await expect(page.locator(".compare-column")).toHaveCount(3, { timeout: 30000 });
  while (await page.locator(".compare-column").count()) await page.getByTestId("comparison-remove-0").click();
  const row = page.locator(".rank-table tbody tr", { has: page.locator(".link-button", { hasText: "86,0° S" }) });
  await row.locator('input[type="checkbox"]').check();
  await page.getByTestId("comparison-add-date-0").click();
  await page.getByTestId("comparison-date-1").selectOption("20261208");
  await page.locator(".data-toolbar select").nth(1).selectOption("comms");
  await page.getByTestId("requirement-maxDarkH-enabled").check();
  await expect(page.getByTestId("selection-comparison-status")).toHaveAttribute("data-status", "available");
  const scenarioIds = await page.locator(".compare-column").evaluateAll((columns) => columns.map((c) => c.dataset.scenarioId));
  await page.getByRole("button", { name: "Assistant", exact: true }).click();
  await expect(page.locator(".ai-form")).toBeVisible();
  await page.locator(".ai-input").fill("Compare exactement les deux scénarios sélectionnés. Appelle compare avec les deux scenarioIds sélectionnés. Cite le verdict de comparaison, les fractions de Soleil et de Terre, et la plus longue nuit. Respecte la priorité et le seuil fournis ; précise les limites du modèle expérimental.");
  const pending = page.waitForResponse((response) => response.url().endsWith("/api/ai/chat"), { timeout: 240000 });
  await page.locator('.ai-form button[type="submit"]').click();
  const response = await pending;
  const answer = await response.json();
  delete answer.sessionId;
  report.result = answer;
  const request = response.request().postDataJSON();
  delete request.sessionId;
  report.request = request;
  expect(response.ok()).toBeTruthy();
  expect(answer.explanationStatus).toBe("available");
  expect(request.context.scenarioIds).toEqual(scenarioIds);
  const comparison = answer.evidence.find((e) => e.kind === "comparison")?.comparison;
  expect(comparison?.scenarioIds).toEqual(scenarioIds);
  expect(comparison.method.priority).toEqual(["earth.anyDisk.fraction"]);
  for (const id of scenarioIds) expect(comparison.verdicts[id].constraints.map((c) => c.constraint)).toEqual(request.constraints);
  await expect(page.locator(".ai-table tbody tr")).toHaveCount(2);
  expect(report.requests).toBe(1);
  expect(report.errors).toEqual([]);
  report.pass = true;
} catch (error) {
  report.failure = error.message;
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  await mkdir(new URL("../.cache/", import.meta.url), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + "\n");
  await browser?.close();
  server.kill("SIGTERM");
}
console.log(JSON.stringify({ pass: report.pass, requests: report.requests, status: report.result?.status, reason: report.result?.reason, budget: report.result?.budget, failure: report.failure, report: fileURLToPath(output) }, null, 2));

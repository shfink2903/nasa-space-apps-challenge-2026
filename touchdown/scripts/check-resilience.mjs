import { expect as baseExpect } from "@playwright/test";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
const expect = baseExpect.configure({ timeout: 30000 });

const REQUIREMENTS = ["minSunShare", "minEarthShare", "maxDarkH"];
const screenshotPath = (output, name) => output instanceof URL ? fileURLToPath(new URL(name, output)) : join(output, name);

async function publishedDataRemainReadable(page, base) {
  await expect(page.locator("#loader")).toHaveCount(0, { timeout: 90_000 });
  await expect(page.locator(".rank-table tbody tr:not(.row-divider)")).toHaveCount(5, { timeout: 30_000 });
  await expect(page.locator(".rank-table.is-loading")).toHaveCount(0);
  await expect(page.locator(".compare-column")).toHaveCount(3);
  for (const key of REQUIREMENTS) {
    await expect(page.getByTestId(`requirement-${key}-enabled`)).not.toBeChecked();
    await expect(page.getByTestId(`requirement-${key}-value`)).toBeDisabled();
  }
  const column = page.getByTestId("comparison-column-0");
  await expect(column).toHaveAttribute("data-scenario-id", /_30d_h2m_lola_/);
  const id = await column.getAttribute("data-scenario-id");
  const response = await page.request.get(new URL(`/data/v1/scenarios/${encodeURIComponent(id)}.json`, base).href);
  expect(response.ok()).toBeTruthy();
  const scenario = await response.json();
  expect(scenario.scenarioId).toBe(id);
  expect(scenario.validationStatus).toBe("not_validated");
  const metricIds = ["overlap.sunAny_earthAny.fraction", "sun.anyDisk.fraction", "earth.anyDisk.fraction"];
  const number = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  for (const [index, metricId] of metricIds.entries()) {
    const metric = scenario.metrics.find((entry) => entry.metricId === metricId);
    expect(metric?.value).not.toBeNull();
    await expect(column.locator(".fact b").nth(index)).toHaveText(`${number.format(metric.value * 100)} %`);
  }
}

async function openAssistant(page) {
  await page.locator(".topbar-right").getByRole("button", { name: "Assistant", exact: true }).click();
  await expect(page.locator(".assistant")).toBeVisible();
  await expect.poll(() => page.locator(".assistant .brief li").count()).toBeGreaterThan(1);
}

async function verifyRealAssistantExchange(page) {
  await openAssistant(page);
  await expect(page.locator(".ai-form")).toBeVisible({ timeout: 15_000 });
  await page.locator(".ai-input").fill("Compare les scénarios sélectionnés avec leurs données publiées.");
  const responsePromise = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/ai/chat" && response.request().method() === "POST");
  await page.locator(".ai-form button[type=submit]").click();
  const response = await responsePromise;
  expect(response.ok()).toBeTruthy();
  const answer = await response.json();
  expect(answer.explanationStatus).toBe("available");
  expect(answer.evidence?.length).toBeGreaterThan(0);
  await expect(page.locator(".ai-answer.is-pending")).toHaveCount(0, { timeout: 20_000 });
  await expect(page.locator(".ai-answer.is-error")).toHaveCount(0);
  await expect(page.locator(".ai-log .ai-table tbody tr")).toHaveCount(3);
  await page.locator(".assistant").getByRole("button", { name: "Fermer", exact: true }).click();
}

async function responsiveChecks(page, label, report, output) {
  for (const locale of ["fr", "en"]) {
    await page.locator(".topbar").getByRole("button", { name: new RegExp(`: ${locale.toUpperCase()}$`) }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    for (const width of [390, 749]) {
      await page.setViewportSize({ width, height: 900 });
      for (const tab of ["explorer", "data"]) {
        await page.locator(`.topbar [data-tab="${tab}"]`).click();
        await expect(page.locator("body")).toHaveAttribute("data-tab", tab);
        const selector = tab === "data" ? ".data-view" : ".explorer";
        try {
          await expect(page.locator(selector)).toBeVisible();
          await expect.poll(() => page.evaluate((selector) => {
            const container = document.querySelector(selector);
            if (!container || getComputedStyle(container).display === "none") return false;
            return document.documentElement.scrollWidth <= innerWidth + 1 && container.scrollWidth <= container.clientWidth + 1;
          }, selector), { message: `${label}: ${locale}, ${width}px, ${tab} horizontal layout` }).toBeTruthy();
        } catch (error) {
          const layout = await page.evaluate((selector) => {
            const container = document.querySelector(selector);
            const dimensions = (element) => {
              const rect = element.getBoundingClientRect();
              const style = getComputedStyle(element);
              return { tag: element.tagName, class: element.getAttribute("class"), left: rect.left, right: rect.right,
                clientWidth: element.clientWidth, scrollWidth: element.scrollWidth, display: style.display,
                minWidth: style.minWidth, overflowX: style.overflowX };
            };
            return { viewportWidth: innerWidth, documentWidth: document.documentElement.scrollWidth,
              container: container ? dimensions(container) : null,
              overflowingElements: container ? [...container.querySelectorAll("*")]
                .filter((element) => element.getClientRects().length && element.getBoundingClientRect().right > innerWidth + 1)
                .slice(0, 20).map(dimensions) : [] };
          }, selector);
          (report.responsiveFailures ??= []).push({ fault: label, locale, width, tab, ...layout });
          await page.screenshot({ path: screenshotPath(output, `resilience-failure-${label}-${locale}-${width}-${tab}.png`) });
          throw new Error(`${label}: ${locale}, ${width}px, ${tab}; layout=${JSON.stringify(layout)}`, { cause: error });
        }
      }
      await page.screenshot({ path: screenshotPath(output, `resilience-${label}-${locale}-${width}.png`) });
    }
  }
  report.checks.push(`${label}: FR/EN at 390 px and 749 px, explorer and data tabs have no horizontal overflow`);
}

/** Production-build checks. The caller owns the browser, server, report and output directory. */
export async function checkResilience(browser, base, report, output) {
  for (const fault of ["webgl-unavailable", "ship-asset-missing", "comparison-api-unavailable"]) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.addInitScript(() => window.localStorage.setItem("touchdown.locale", "fr"));
    try {
      if (fault === "webgl-unavailable") {
        await page.addInitScript(() => {
          const original = HTMLCanvasElement.prototype.getContext;
          HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
            if (/^(webgl2?|experimental-webgl)$/i.test(kind)) return null;
            return original.call(this, kind, ...args);
          };
        });
      } else if (fault === "ship-asset-missing") {
        await page.route("**/models/starship.glb", (route) => route.fulfill({ status: 404, contentType: "text/plain", body: "Expected test fault: missing 3D asset" }));
      } else {
        await page.route("**/api/compare", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "test_service_unavailable" } }) }));
        await page.route("**/api/health", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ai: { configured: false } }) }));
      }

      await page.goto(base);
      if (fault !== "comparison-api-unavailable") {
        await expect(page.locator("body")).toHaveAttribute("data-tab", "data", { timeout: 60_000 });
        await expect(page.getByTestId("scene-status")).toBeVisible();
        await expect(page.getByTestId("scene-status")).toHaveText("Vue 3D indisponible. Données et assistant restent accessibles.");
        await expect(page.locator(".site-card .button-primary")).toBeDisabled();
        await expect(page.locator(".flight-bar #auto-flight")).toBeHidden();
      } else {
        await expect(page.locator("#loader")).toHaveCount(0, { timeout: 90_000 });
        await page.locator('.topbar [data-tab="data"]').click();
      }

      await publishedDataRemainReadable(page, base);
      if (fault !== "comparison-api-unavailable") {
        await expect(page.getByTestId("catalogue-comparison-status")).toHaveAttribute("data-status", "available", { timeout: 30_000 });
        await verifyRealAssistantExchange(page);
        report.checks.push(`${fault}: data mode opens, 5 sites and published metrics remain readable, all requirements start disabled, 3D controls disabled, real local API/model-double exchange succeeds`);
      } else {
        await page.getByTestId("requirement-minSunShare-enabled").check();
        await page.getByTestId("requirement-minSunShare-value").fill("0");
        await expect(page.getByTestId("catalogue-comparison-status")).toHaveAttribute("data-status", "unavailable");
        await expect(page.getByTestId("catalogue-comparison-status")).toContainText("Moteur de comparaison indisponible");
        await expect(page.locator('#data-view [data-verdict="pass"]')).toHaveCount(0);
        await expect(page.locator(".rank-table tbody tr:not(.row-divider)")).toHaveCount(5);
        await expect(page.locator(".rank-table .cell-share").first()).toContainText("%");
        await expect(page.locator(".rank-table .site-rank")).toHaveText(["–", "–", "–", "–", "–"]);
        await openAssistant(page);
        await expect(page.locator(".ai-form")).toBeHidden();
        await expect(page.locator(".assistant")).toContainText("Serveur présent, mais aucun modèle n'est configuré.");
        await expect(page.locator(".assistant .brief")).toContainText("%");
        await page.locator(".assistant").getByRole("button", { name: "Fermer", exact: true }).click();
        report.checks.push(`${fault}: 503 is explicit, published values remain readable, active zero-threshold requirement produces no pass verdict, unconfigured AI hides its form and keeps the deterministic summary`);
      }
      await responsiveChecks(page, fault, report, output);
      expect(pageErrors, `${fault}: no uncaught page error`).toEqual([]);
      report.checks.push(`${fault}: no uncaught browser page error`);
    } finally {
      if (pageErrors.length) report.errors.push(...pageErrors.map((message) => `${fault}: ${message}`));
      await page.close();
    }
  }
}

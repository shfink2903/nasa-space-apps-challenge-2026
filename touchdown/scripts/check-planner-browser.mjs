import { expect as baseExpect } from "@playwright/test";
import { fileURLToPath } from "node:url";
const expect = baseExpect.configure({ timeout: 30000 });

/** UI → production HTTP API → real comparison/evidence engine → rendered answer. */
export async function checkPlanner(browser, base, report, output, { json, sites }) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
  await page.addInitScript(() => localStorage.setItem("touchdown.locale", "fr"));
  page.on("pageerror", (error) => report.errors.push(error.message));
  const comparisons = [];
  page.on("response", async (res) => {
    if (res.url().endsWith("/api/compare") && res.ok()) comparisons.push({ request: res.request().postDataJSON(), result: await res.json() });
  });
  const sid = (site, date, height = 2) => sites.find((s) => s.id === site).scenarioIds.find((id) => id.includes(`_${date}_30d_h${height}m_lola_`));
  const dataTab = () => page.locator('[role="tab"][data-tab="data"]').click();
  const explorerTab = () => page.locator('[role="tab"][data-tab="explorer"]').click();
  const ready = () => expect(page.getByTestId("catalogue-comparison-status")).toHaveAttribute("data-status", "available", { timeout: 30000 });
  const selectionReady = () => expect(page.getByTestId("selection-comparison-status")).toHaveAttribute("data-status", "available", { timeout: 30000 });
  const globalDate = (date) => page.locator(".data-toolbar select").first().selectOption(date);
  const clearSelection = async () => {
    while (await page.locator(".compare-column").count()) await page.getByTestId("comparison-remove-0").click();
  };
  const requirements = async (enabled) => {
    for (const key of ["minSunShare", "minEarthShare", "maxDarkH"]) await page.getByTestId(`requirement-${key}-enabled`).setChecked(enabled);
  };
  const chat = async () => {
    if (!await page.locator(".assistant").isVisible()) await page.getByRole("button", { name: "Assistant", exact: true }).click();
    await expect(page.locator(".ai-form")).toBeVisible();
    const response = page.waitForResponse((r) => r.url().endsWith("/api/ai/chat"), { timeout: 60000 });
    await page.locator(".ai-input").fill("Compare exactement la sélection avec les priorités et contraintes affichées.");
    await page.locator('.ai-form button[type="submit"]').click();
    const res = await response;
    expect(res.ok()).toBeTruthy();
    const answer = await res.json();
    expect(answer.explanationStatus, JSON.stringify(answer)).toBe("available");
    await expect(page.locator(".ai-answer.is-pending")).toHaveCount(0);
    const comparison = answer.evidence.find((e) => e.kind === "comparison")?.comparison;
    expect(comparison).toBeTruthy();
    return { request: res.request().postDataJSON(), answer, comparison };
  };
  const closeChat = () => page.locator(".assistant .panel-head button").click();
  try {
    await page.goto(base);
    await expect(page.locator("#loader")).toHaveCount(0, { timeout: 90000 });
    await dataTab();
    await ready();
    await expect(page.locator(".compare-column")).toHaveCount(3);
    for (const key of ["minSunShare", "minEarthShare", "maxDarkH"]) await expect(page.getByTestId(`requirement-${key}-enabled`)).not.toBeChecked();
    await expect(page.locator('.rank-table [data-verdict="pass"]')).toHaveCount(0);
    report.checks.push("Initial mission constraints are empty; no implicit favorable verdict");

    await requirements(true);
    await ready();
    await selectionReady();
    await expect(page.locator('.compare-column [data-verdict="pass"]')).toHaveCount(1);
    await expect(page.locator('.compare-column [data-verdict="fail"]')).toHaveCount(2);
    await globalDate("20270713");
    await ready();
    const study86 = page.locator(".rank-table tbody tr", { has: page.locator(".link-button", { hasText: "86,0° S" }) });
    await expect(study86.locator(".verdict")).toHaveAttribute("data-verdict", "unknown");
    await expect(study86).toContainText("≥");
    const july = comparisons.findLast((c) => c.request.scenarioIds.includes(sid("sp_s8600", "20270713")) && c.request.constraints.length === 3);
    expect(july.result.verdicts[sid("sp_s8600", "20270713")].status).toBe("unknown");
    report.checks.push("July truncated darkness stays unknown under ≤360 h; December three candidates produce 1 pass and 2 fail from the API");

    await globalDate("20261201");
    await clearSelection();
    const none = await chat();
    expect(none.request.context.scenarioIds).toHaveLength(1);
    expect(none.comparison.scenarioIds).toEqual(none.request.context.scenarioIds);
    expect(none.request.constraints).toHaveLength(3);
    await closeChat();
    await study86.locator('input[type="checkbox"]').check();
    await selectionReady();
    const one = await chat();
    expect(one.request.context.scenarioIds).toEqual([sid("sp_s8600", "20261201")]);
    expect(one.comparison.scenarioIds).toEqual(one.request.context.scenarioIds);
    expect(one.answer.sessionId).toBe(none.answer.sessionId);
    await closeChat();
    report.checks.push("Zero explicit comparisons binds AI to the focused scenario; one selection stays one, with the same conversation session");

    await page.getByTestId("comparison-add-date-0").click();
    await page.getByTestId("comparison-date-1").selectOption("20261208");
    await page.locator(".data-toolbar .segment", { hasText: /^10 m$/ }).click();
    await page.locator(".data-toolbar select").nth(1).selectOption("comms");
    await selectionReady();
    const expectedIds = [sid("sp_s8600", "20261201", 10), sid("sp_s8600", "20261208", 10)];
    await expect(page.getByTestId("comparison-column-0")).toHaveAttribute("data-scenario-id", expectedIds[0]);
    await expect(page.getByTestId("comparison-column-1")).toHaveAttribute("data-scenario-id", expectedIds[1]);
    const two = await chat();
    expect(two.request.context.scenarioIds).toEqual(expectedIds);
    expect(two.request.context.priority).toEqual(["earth.anyDisk.fraction"]);
    expect(two.request.constraints.map((c) => c.value)).toEqual([0.25, 0.25, 360]);
    expect(two.comparison.scenarioIds).toEqual(expectedIds);
    expect(two.comparison.method.priority).toEqual(two.request.context.priority);
    for (const id of expectedIds) expect(two.comparison.verdicts[id].constraints.map((c) => c.constraint)).toEqual(two.request.constraints);
    await expect(page.locator(".ai-table").last().locator("tbody tr")).toHaveCount(2);
    expect(await page.locator(".ai-table").last().locator("tbody tr").evaluateAll((rows) => rows.map((r) => r.dataset.scenarioId))).toEqual(expectedIds);
    await page.screenshot({ path: fileURLToPath(new URL("build-ai-multidate.png", output)) });
    await closeChat();
    report.checks.push("Same site on two dates: UI and assistant share exact scenario IDs, 10 m, Earth priority and all three constraints; evidence retains distinct dated rows");

    await requirements(false);
    await selectionReady();
    const cleared = await chat();
    expect(cleared.request.constraints).toEqual([]);
    expect(cleared.answer.sessionId).toBe(two.answer.sessionId);
    for (const id of expectedIds) expect(cleared.comparison.verdicts[id].status).toBe("not_evaluated");
    await closeChat();
    report.checks.push("Clearing constraints in the same AI session removes previous thresholds and favorable verdicts");

    // Hold a real response until a newer selection has already rendered.
    let release, held;
    const heldResponse = new Promise((resolve) => { held = resolve; });
    const releaseResponse = new Promise((resolve) => { release = resolve; });
    await page.route("**/api/compare", async (route) => {
      if (!route.request().postDataJSON().scenarioIds.every((id) => id.includes("_20271005_"))) return route.continue();
      const response = await route.fetch();
      held();
      await releaseResponse;
      await route.fulfill({ response });
    });
    await globalDate("20271005");
    await heldResponse;
    await globalDate("20271012");
    await ready();
    release();
    await expect.poll(() => comparisons.some((c) => c.request.scenarioIds.every((id) => id.includes("_20271005_")))).toBeTruthy();
    await expect(page.locator(".data-toolbar select").first()).toHaveValue("20271012");
    const october = await json(`scenarios/${sid("sp_s8600", "20271012", 10)}.json`);
    const share = october.metrics.find((m) => m.metricId === "sun.anyDisk.fraction").value;
    await expect(study86.locator(".cell-share").nth(1)).toContainText(new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(share * 100));
    await page.unroute("**/api/compare");
    report.checks.push("A delayed comparison response cannot replace the newly selected date or its metrics");

    await globalDate("20261208");
    await study86.locator(".link-button").click();
    await explorerTab();
    await expect(page.getByTestId("scene-status")).toHaveAttribute("data-status", "ready", { timeout: 90000 });
    await expect(page.locator(".site-card")).not.toHaveClass(/is-loading/);
    const scenario = await json(`scenarios/${sid("sp_s8600", "20261208", 10)}.json`);
    const rise = scenario.events.find((e) => e.body === "sun" && e.convention === "anyDisk" && e.type === "rise");
    const t0 = Date.parse(scenario.request.surfaceStartUtc.value);
    const beforeIndex = Math.floor((Date.parse(rise.tUtc) - t0) / 600000);
    await page.locator(".scrub-range").fill(String(beforeIndex));
    await expect(page.locator(".site-card .now-sun")).toHaveAttribute("data-visibility", "0");
    await page.getByRole("button", { name: "Aller au prochain lever du Soleil" }).click();
    await expect(page.locator(".site-card .now-sun")).toHaveAttribute("data-visibility", /[12]/);
    await expect(page.locator(".clock-time")).toHaveText(new Date(rise.tUtc).toISOString().slice(11, 16));
    await expect(page.locator(".site-card .button-primary")).toBeEnabled();
    const set = scenario.events.find((e) => e.body === "sun" && e.convention === "anyDisk" && e.type === "set");
    // Fractional position follows the same input handler as chart scrubbing.
    await page.locator(".scrub-range").evaluate((el, value) => { el.step = "any"; el.value = String(value); el.dispatchEvent(new Event("input", { bubbles: true })); }, (Date.parse(set.tUtc) - t0) / 600000);
    await expect(page.locator(".site-card .now-sun")).toHaveAttribute("data-visibility", "0");
    await expect(page.locator(".site-card .button-primary")).toBeDisabled();
    await page.locator(".scrub-range").fill("4320");
    await expect(page.locator(".site-card .now-sun")).toHaveAttribute("data-visibility", "unknown");
    await expect(page.locator(".site-card .button-primary")).toBeDisabled();
    report.checks.push("Exact rise, exact set and analysis endpoint: visibility and flight eligibility follow half-open windows, with unknown at the uncovered end");
  } finally {
    await page.close();
  }
}

// Tests the production build. External network is blocked throughout the run.
import { chromium, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const base = process.env.LUNAR_DEMO_URL ?? 'http://127.0.0.1:8012';
const version = process.env.LUNAR_DATASET_VERSION ?? 'v1.1-relief-year';
const out = new URL(`../.cache/relief/${version}/`, import.meta.url);
const root = new URL(`../../data/processed/${version}/`, import.meta.url);
const read = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'));
const sites = (await read('sites.json')).sites;
const manifest = await read('manifest.json');
const dates = [...new Set(sites[0].scenarioIds.map(id => /_(\d{8})_30d_/.exec(id)[1]))].sort();
const report = { pass: false, datasetVersion: version, checks: [], errors: [], failedRequests: [], externalRequests: [], horizons: [], scenarios: [] };
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-webgl'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: 'fr-FR', reducedMotion: 'reduce' });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === new URL(base).origin || ['data:', 'blob:'].includes(url.protocol)) return route.continue();
    report.externalRequests.push(url.origin + url.pathname);
    return route.abort('internetdisconnected');
  });
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
  page.on('requestfailed', request => report.failedRequests.push(request.url()));
  page.on('response', response => {
    if (response.status() >= 400) report.errors.push(`${response.status()} ${response.url()}`);
    if (response.url().includes('/horizons/')) report.horizons.push(response.url());
    if (response.url().includes('/scenarios/')) report.scenarios.push(response.url());
  });
  await page.goto(`${base}/?lang=fr`);
  await expect(page.locator('#loader')).toHaveCount(0, { timeout: 120000 });
  if (version === 'v1') {
    await page.locator('.topnav').getByRole('button', { name: 'Évaluer les sites', exact: true }).click();
    await expect(page.locator('.page')).toBeVisible();
    expect(await page.locator('.page tbody tr').count()).toBeGreaterThan(3);
    await page.locator('tr[data-site-id="sp_s8600"]').click();
    await expect(page.locator('.conditions')).toBeVisible();
    await expect.poll(() => report.horizons.length).toBeGreaterThan(0);
    expect(report.horizons.length).toBeGreaterThan(0);
    expect(report.scenarios.length).toBeGreaterThan(0);
    expect(report.errors).toEqual([]);
    expect(report.externalRequests).toEqual([]);
    report.checks.push('v1 backup starts and opens comparison with external network blocked');
    report.pass = true;
  } else {
  const openCompare = async () => {
    await page.locator('.topnav').getByRole('button', { name: 'Évaluer les sites', exact: true }).click();
    await expect(page.locator('.page')).toBeVisible();
    await expect(page.locator('.page tbody tr')).toHaveCount(3);
  };
  await openCompare();
  await expect(page.locator('.sites-card input')).toHaveCount(0);
  expect(await page.locator('.cmp-slider').getAttribute('max')).toBe(String(dates.length - 1));
  if (dates.length < 52) await expect(page.locator('.page-tabs button').nth(1)).toBeHidden();
  report.checks.push('Exactly three study sites; custom coordinates absent; calendar matches bundle coverage');

  const testedDates = [...new Set([dates[0], dates.at(-1)])];
  let height = 2;
  for (const date of testedDates) {
    await openCompare();
    await page.locator('.cmp-slider').fill(String(dates.indexOf(date)));
    await page.locator('.cmp-slider').dispatchEvent('input');
    for (const site of sites) {
      for (const requestedHeight of [2, 10]) {
        await openCompare();
        await page.locator(`tr[data-site-id="${site.id}"]`).click();
        await expect(page.locator('.conditions')).toBeVisible();
        await page.locator('.conditions details.more > summary').click();
        // A previously opened details element can remain open after changing site.
        if (!(await page.locator('.conditions details.more').getAttribute('open')) && !(await page.locator('.conditions details.more').evaluate(el => el.open))) {
          await page.locator('.conditions details.more > summary').click();
        }
        await page.locator('.conditions').getByRole('button', { name: `${requestedHeight} m`, exact: true }).click();
        height = requestedHeight;
        const id = site.scenarioIds.find(id => id.includes(`_${date}_30d_h${height}m_lola_`));
        await expect(page.locator('.conditions')).toContainText(id, { timeout: 15000 });
        await expect(page.locator('.cond-model')).toContainText(`hauteur ${height} m · covered`);
        await expect(page.locator('.cond-model')).toContainText(version);
        await expect(page.locator('.sky-chart')).toBeVisible();
        expect(await page.locator('.sky-chart').evaluate(el => el.width)).toBeGreaterThan(0);
        const scenario = await read(`scenarios/${id}.json`);
        const profile = await read(`horizons/${site.id}_h${height}m_${scenario.profileId}.json`);
        expect(profile.terrainMethodId).toBe(manifest.terrainMethodId);
        expect(profile.truncatedAzimuthCount).toBe(0);
        await openCompare();
        const row = page.locator(`tr[data-site-id="${site.id}"]`);
        for (const [column, metric] of [['sun', 'sun.anyDisk.fraction'], ['earth', 'earth.anyDisk.fraction'], ['overlap', 'overlap.sunAny_earthAny.fraction']]) {
          const value = scenario.metrics.find(m => m.metricId === metric).value;
          const displayed = await row.locator(`td[data-col="${column}"] b`).innerText();
          const expected = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value * 30);
          expect(displayed.replace(/\s/g, '')).toContain(expected.replace(/\s/g, ''));
        }
        report.checks.push(`${site.id}, ${height} m, ${date}: source metrics equal displayed comparison; correct horizon loaded`);
      }
    }
  }
  await page.screenshot({ path: fileURLToPath(new URL('comparison.png', out)), fullPage: true });
  if (dates.length === 52) {
    await page.locator('.page-tabs button').nth(1).click();
    await expect(page.locator('.page')).toContainText('2027');
    report.checks.push('Annual calendar opens with the 52 recalculated weekly starts');
  }
  expect(new Set(report.horizons).size).toBe(6);
  expect(report.externalRequests).toEqual([]);
  expect(report.failedRequests).toEqual([]);
  expect(report.errors).toEqual([]);
  report.checks.push('Production build works with external network blocked; no AI dependency; no browser errors');
  report.pass = true;
  }
} catch (error) {
  report.failure = String(error);
  throw error;
} finally {
  await writeFile(new URL('report.json', out), JSON.stringify(report, null, 2));
  await browser.close();
}
console.log(JSON.stringify({ pass: report.pass, checks: report.checks.length, report: fileURLToPath(new URL('report.json', out)) }));

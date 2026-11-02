/** Real-browser release gate for the assembled GitHub Pages research site.
 * Run from the repository root after build.py. Outputs live beside this script
 * in check-results/. No external web requests or scientific computations needed.
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(process.cwd(), 'dist');
const OUT = path.join(HERE, 'check-results');
const PREFIX = '/Interpretability-web/';
const SLUGS = ['grammar', 'physics', 'decay', 'b1', 'latent', 'geometry'];
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.csv': 'text/csv; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ico': 'image/x-icon',
};
mkdirSync(OUT, { recursive: true });
const report = {
  status: 'running', startedAt: new Date().toISOString(), prefix: PREFIX,
  dist: DIST, checks: [], failures: [], serverErrors: [],
  scope: 'Homepage filters/search/mobile layout; six route loads; one chart interaction per legacy dashboard; geometry controls and all 32 default section datasets; shared navigation. This does not validate scientific conclusions.',
};
const save = () => writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(report, null, 2) + '\n');
save();

let server;
let browser;
let origin;
let home;
let deadlineTimer;

async function serve() {
  assert(existsSync(path.join(DIST, 'index.html')), 'Assembled dist/index.html is missing; run the site build first.');
  server = createServer((req, res) => {
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
    catch { res.writeHead(400); res.end('Bad URL'); return; }
    // Browsers may request a favicon automatically; it is not a site dependency.
    if (pathname === '/favicon.ico' || pathname === PREFIX + 'favicon.ico') {
      res.writeHead(204); res.end(); return;
    }
    const fail = (status, message) => {
      report.serverErrors.push({ method: req.method, path: pathname, status });
      res.writeHead(status, { 'Content-Type': 'text/plain' }); res.end(message);
    };
    // Deliberately reject root-relative /assets and /data. The published site
    // lives below the repository prefix, so a permissive server would hide bugs.
    if (!pathname.startsWith(PREFIX)) { fail(404, 'Outside GitHub Pages prefix'); return; }
    let filename = path.resolve(DIST, pathname.slice(PREFIX.length));
    if (filename !== DIST && !filename.startsWith(DIST + path.sep)) { fail(403, 'Forbidden'); return; }
    try {
      if (statSync(filename).isDirectory()) filename = path.join(filename, 'index.html');
      if (!statSync(filename).isFile()) { fail(404, 'File not found'); return; }
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(filename).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      if (req.method === 'HEAD') { res.end(); return; }
      createReadStream(filename).on('error', error => {
        report.serverErrors.push({ path: pathname, error: error.message });
        res.destroy(error);
      }).pipe(res);
    } catch { fail(404, 'File not found'); }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  origin = `http://127.0.0.1:${server.address().port}`;
  home = origin + PREFIX;
  report.origin = origin;
}

async function screenshot(page, name) {
  const filename = `${name}.png`;
  await page.screenshot({ path: path.join(OUT, filename), fullPage: false, animations: 'disabled', timeout: 10000 });
  return filename;
}

async function check(name, viewport, action) {
  const started = Date.now();
  const entry = { name, status: 'running', viewport, pageErrors: [], httpErrors: [], failedRequests: [], consoleErrors: [], externalRequests: [], assertions: [] };
  report.checks.push(entry);
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce', deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.setDefaultNavigationTimeout(25000);
  page.on('pageerror', error => entry.pageErrors.push(error.message));
  page.on('response', response => {
    if (response.status() >= 400) entry.httpErrors.push({ url: response.url(), status: response.status() });
  });
  page.on('requestfailed', request => entry.failedRequests.push({
    url: request.url(), resourceType: request.resourceType(), error: request.failure()?.errorText,
  }));
  page.on('request', request => {
    if (/^https?:/.test(request.url()) && !request.url().startsWith(origin + '/')) entry.externalRequests.push(request.url());
  });
  // Console errors are recorded for diagnosis; only runtime errors and failed
  // resource requests gate deployment, avoiding Plotly/WebGL warning noise.
  page.on('console', message => {
    if (message.type() === 'error') entry.consoleErrors.push(message.text());
  });
  try {
    await action(page, entry);
    await page.waitForLoadState('networkidle', { timeout: 10000 });
    assert.equal(entry.pageErrors.length, 0, `${name}: browser runtime errors: ${entry.pageErrors.join('; ')}`);
    assert.equal(entry.httpErrors.length, 0, `${name}: failed HTTP resources: ${JSON.stringify(entry.httpErrors)}`);
    // Intentional navigation can cancel an in-flight request. Retain those in
    // the report but fail all other resource-loading errors.
    const resourceFailures = entry.failedRequests.filter(item => !/ERR_ABORTED|NS_BINDING_ABORTED/.test(item.error || ''));
    assert.equal(resourceFailures.length, 0, `${name}: failed requests: ${JSON.stringify(resourceFailures)}`);
    entry.status = 'passed';
    console.log(`PASS ${name}`);
  } catch (error) {
    entry.status = 'failed';
    entry.error = error.stack || String(error);
    report.failures.push({ check: name, error: error.message || String(error) });
    try { entry.failureScreenshot = await screenshot(page, `${name}-failure`); } catch (_) { /* Preserve original error. */ }
    console.error(`FAIL ${name}: ${error.message}`);
  } finally {
    entry.durationMs = Date.now() - started;
    save();
    await context.close();
  }
}

async function goto(page, url) {
  const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
  // Same-document hash navigation deliberately has no HTTP response.
  assert(response ? response.ok() : page.url() === url, `Navigation failed: ${url} (${response?.status() ?? 'no response'})`);
}

async function homeReady(page) {
  await page.locator('.catalogue-tools').waitFor({ state: 'visible' });
  assert.equal(await page.locator('.dashboard-card').count(), 6, 'Homepage must contain all six dashboard cards.');
}

async function visibleCards(page, count) {
  await page.waitForFunction(expected => document.querySelectorAll('.dashboard-card:not([hidden])').length === expected, count);
}

async function legacyReady(page) {
  await page.waitForFunction(() => {
    const root = document.getElementById('root');
    const text = root?.innerText || '';
    return root?.childElementCount > 0 && text.trim().length > 80
      && !root.querySelector('.loading-container')
      && !/Failed to load data|Loading (?:data|B1-v2|physics_decay_type|explorer data|heatmap data|cluster semantics|candidate selection|abstraction data|clustering data)/i.test(text);
  }, null, { timeout: 25000 });
}

async function chartReady(page, selector = '#root') {
  await page.waitForFunction(scope => [...document.querySelectorAll(`${scope} .js-plotly-plot`)].some(plot => plot._fullLayout && plot.data?.length > 0), selector, { timeout: 20000 });
}

async function navigationReady(page, slug) {
  const nav = page.getByRole('navigation', { name: 'Research dashboard navigation' });
  await nav.waitFor({ state: 'visible' });
  assert.equal(await nav.getByRole('link', { name: 'All dashboards' }).getAttribute('href'), home, 'Shared home link must preserve the repository prefix.');
  assert.equal(await nav.getByRole('combobox', { name: 'Switch dashboard' }).inputValue(), slug);
  assert.equal(await nav.locator('option').count(), 6);
}

async function returnHome(page) {
  await page.getByRole('navigation', { name: 'Research dashboard navigation' }).getByRole('link', { name: 'All dashboards' }).click();
  await page.waitForURL(home);
  await homeReady(page);
  await visibleCards(page, 6);
}

async function suite() {
  await serve();
  const playwrightModule = process.env.PLAYWRIGHT_MODULE;
  assert(playwrightModule, 'Set PLAYWRIGHT_MODULE to the installed Playwright index.mjs path.');
  const { chromium } = await import(pathToFileURL(path.resolve(playwrightModule)).href);
  browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
  report.browserVersion = browser.version();

  await check('home-desktop', { width: 1440, height: 1000 }, async (page, entry) => {
    await goto(page, home);
    await homeReady(page);
    await visibleCards(page, 6);
    const links = await page.locator('.dashboard-link').evaluateAll(nodes => nodes.map(node => node.href).sort());
    assert.deepEqual(links, SLUGS.map(slug => `${home}dashboards/${slug}/`).sort());
    await page.getByRole('button', { name: 'Math & geometry', exact: true }).click();
    await visibleCards(page, 1);
    assert.equal(await page.locator('.dashboard-card:visible .dashboard-link').getAttribute('href'), 'dashboards/geometry/');
    await page.getByRole('searchbox').fill('French');
    await visibleCards(page, 0);
    assert(await page.locator('#empty-state').isVisible(), 'No-results state must be visible.');
    await page.getByRole('button', { name: 'Show all dashboards' }).click();
    await visibleCards(page, 6);
    await page.getByRole('searchbox').fill('French');
    await visibleCards(page, 1);
    assert.equal(await page.locator('.dashboard-card:visible .dashboard-link').getAttribute('href'), 'dashboards/b1/');
    await goto(page, home + '#topic=features&q=French');
    await homeReady(page);
    await visibleCards(page, 1);
    assert.equal(await page.getByRole('searchbox').inputValue(), 'French', 'Shared search URL must restore its query.');
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await visibleCards(page, 6);
    await page.locator('[data-filter-jump][href="#topic=clustering"]').click();
    await visibleCards(page, 2);
    assert.equal(await page.locator('[data-topic="clustering"]').getAttribute('aria-pressed'), 'true');
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await visibleCards(page, 6);
    await page.evaluate(() => window.scrollTo(0, 0));
    entry.screenshot = await screenshot(page, 'home-desktop');
    entry.assertions.push('Six correct prefixed links', 'Topic and search intersection', 'Empty state and reset', 'French query reaches multilingual dashboard', 'URL state restoration', 'Research-question navigation');
  });

  await check('home-mobile', { width: 390, height: 844 }, async (page, entry) => {
    await goto(page, home);
    await homeReady(page);
    await visibleCards(page, 6);
    const size = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
    assert(size.document <= size.viewport + 1 && size.body <= size.viewport + 1, `Homepage overflows horizontally at 390px: ${JSON.stringify(size)}`);
    await page.getByRole('searchbox').fill('grammar');
    await visibleCards(page, 1);
    assert.equal(await page.locator('.dashboard-card:visible .dashboard-link').getAttribute('href'), 'dashboards/grammar/');
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await visibleCards(page, 6);
    await page.evaluate(() => window.scrollTo(0, 0));
    entry.screenshot = await screenshot(page, 'home-mobile');
    entry.assertions.push('390px viewport has no horizontal overflow', 'Search and reset work on mobile');
  });

  const tabs = { grammar: 'Experiment Comparison', physics: 'Layer Heatmap', decay: 'Heatmap', b1: 'Heatmap', latent: 'Heatmap Overview' };
  for (const [slug, tab] of Object.entries(tabs)) {
    await check(slug, { width: 1440, height: 1000 }, async (page, entry) => {
      await goto(page, `${home}dashboards/${slug}/`);
      await legacyReady(page);
      await navigationReady(page, slug);
      await page.getByRole('button', { name: tab, exact: true }).click();
      await legacyReady(page);
      await chartReady(page, slug === 'latent' ? '#root' : '.panel-bottom');
      assert(!/Failed to load data/i.test(await page.locator('#root').innerText()));
      entry.screenshot = await screenshot(page, slug);
      entry.assertions.push('Nonempty loaded application', `Tab opens and renders Plotly data: ${tab}`, 'Shared navigation identifies this route');
      await returnHome(page);
      entry.assertions.push('All dashboards link returns to the catalogue');
    });
  }

  await check('geometry', { width: 1440, height: 1000 }, async (page, entry) => {
    await goto(page, `${home}dashboards/geometry/`);
    await navigationReady(page, 'geometry');
    await page.waitForFunction(() => window.__geometryReady === true && window.__geometryState?.status === 'ready', null, { timeout: 25000 });
    assert(await page.locator('#data-table tbody tr').count() > 0, 'Geometry must render saved result rows.');
    const plotCount = await page.locator('#plot.js-plotly-plot, #plot .js-plotly-plot').count();
    assert(plotCount > 0, 'Geometry initial plot must be initialized.');
    const chart = page.locator('#chart-select');
    const currentChart = await chart.inputValue();
    const choices = await chart.locator('option').evaluateAll(nodes => nodes.filter(node => !node.disabled).map(node => node.value));
    const alternate = choices.find(value => value !== currentChart && ['scatter', 'line'].includes(value));
    assert(alternate, 'Geometry chart control needs a second supported plotting mode.');
    await chart.selectOption(alternate);
    await page.waitForFunction(mode => window.__geometryState?.status === 'ready' && window.__geometryState?.chart === mode, alternate);
    const section = page.locator('#section-select');
    const sectionChoices = await section.locator('option').evaluateAll(nodes => nodes.filter(node => !node.disabled).map(node => node.value));
    assert.equal(sectionChoices.length, 32, 'Geometry must expose all 32 saved sections.');
    entry.geometrySections = [];
    for (const id of sectionChoices) {
      const started = Date.now();
      await section.selectOption(id);
      await page.waitForFunction(value => window.__geometryState?.status === 'ready' && String(window.__geometryState?.page) === value, id, { timeout: 20000 });
      const rendered = await page.evaluate(() => {
        const plots = [...document.querySelectorAll('#plot.js-plotly-plot, #plot .js-plotly-plot')];
        return {
          tableRows: document.querySelectorAll('#data-table tbody tr').length,
          nonemptyPlot: plots.some(plot => plot._fullLayout && plot.data?.some(trace =>
            ['x', 'y', 'z', 'labels', 'values'].some(key => trace[key]?.length > 0))),
          state: window.__geometryState,
        };
      });
      assert(rendered.tableRows > 0 || rendered.nonemptyPlot, `Geometry section ${id} has neither result rows nor a nonempty plot.`);
      assert.equal(entry.pageErrors.length, 0, `Geometry section ${id} produced runtime errors: ${entry.pageErrors.join('; ')}`);
      assert.equal(entry.httpErrors.length, 0, `Geometry section ${id} failed resource requests: ${JSON.stringify(entry.httpErrors)}`);
      const capture = await screenshot(page, `geometry-section-${id.replace(/[^a-z0-9_-]/gi, '_')}`);
      entry.geometrySections.push({ section: id, durationMs: Date.now() - started, ...rendered, screenshot: capture });
      console.log(`PASS geometry section ${id}`);
      save();
    }
    entry.screenshot = await screenshot(page, 'geometry');
    entry.assertions.push('Saved result table and initial plot load', 'Chart mode changes', 'All 32 sections render their default dataset without runtime or HTTP errors');
    await page.getByRole('combobox', { name: 'Switch dashboard' }).selectOption('grammar');
    await page.waitForURL(`${home}dashboards/grammar/`);
    await legacyReady(page);
    await navigationReady(page, 'grammar');
    entry.assertions.push('Shared switcher navigates between dashboards');
    await returnHome(page);
  });
}

try {
  await Promise.race([
    suite(),
    new Promise((_, reject) => { deadlineTimer = setTimeout(() => reject(new Error('Browser suite exceeded its 360-second deadline.')), 360000); }),
  ]);
} catch (error) {
  report.failures.push({ check: 'suite', error: error.stack || String(error) });
  console.error(error);
} finally {
  clearTimeout(deadlineTimer);
  if (browser) await browser.close().catch(error => report.failures.push({ check: 'browser-close', error: String(error) }));
  if (server) {
    server.closeAllConnections?.();
    await new Promise(resolve => server.close(resolve));
  }
  if (report.serverErrors.length) report.failures.push({ check: 'static-server', error: 'Unexpected missing/forbidden resources', requests: report.serverErrors });
  report.finishedAt = new Date().toISOString();
  report.status = report.failures.length ? 'failed' : 'passed';
  save();
}

if (report.status !== 'passed') {
  throw new Error(`Browser release gate failed (${report.failures.length} failures). See ${path.join(OUT, 'results.json')}`);
}
console.log(`Browser release gate passed: ${report.checks.length} checks. Results: ${OUT}`);

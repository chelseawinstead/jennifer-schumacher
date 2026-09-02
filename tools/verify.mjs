/*
 * Check a built site before pushing it.
 *
 *   npm install playwright        (once)
 *   node tools/verify.mjs . /tmp/shots
 *
 * Serves the site the way Vercel does (clean URLs), walks every route, and
 * reports broken images, dead links, console errors, unexpected outside
 * requests and horizontal overflow on a phone — then exercises the contact
 * modal, the property film and the mobile menu, and confirms the pages still
 * render with JavaScript switched off. Full-page screenshots go to the output
 * directory. Exits non-zero if anything failed.
 */
import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';

const ROOT = process.argv[2] || '.';
const OUT = process.argv[3] || 'shots';
const PORT = 4173;
const ORIGIN = `http://localhost:${PORT}`;
fs.mkdirSync(OUT, { recursive: true });

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.xml': 'application/xml', '.txt': 'text/plain', '.woff2': 'font/woff2'
};

// Optional offline font cache (tools/.fonts/fonts.css + .woff2 files). Without
// it, Google Fonts is fetched normally. Either way the layout is measured with
// the real typography — fallback metrics produce false overflow reports.
const FONT_DIR = path.join(path.dirname(new URL(import.meta.url).pathname), '.fonts');
const FONT_CSS = fs.existsSync(path.join(FONT_DIR, 'fonts.css'))
  ? fs.readFileSync(path.join(FONT_DIR, 'fonts.css'), 'utf8')
      .replace(/\/__fonts\//g, `${ORIGIN}/__fonts/`)
  : null;

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url.startsWith('/__fonts/')) {
    res.writeHead(200, { 'Content-Type': 'font/woff2' });
    res.end(fs.readFileSync(path.join(FONT_DIR, path.basename(url))));
    return;
  }
  let file = path.join(ROOT, url);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    if (fs.existsSync(file + '/index.html')) file += '/index.html';
    else if (fs.existsSync(file + '.html')) file += '.html';
    else { res.writeHead(404); res.end('not found'); return; }
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  res.end(fs.readFileSync(file));
});
await new Promise(r => server.listen(PORT, r));

/** Local requests pass through; fonts come from the cache when present;
 *  anything else is recorded and blocked. */
function intercept(page, asked) {
  return page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.host === `localhost:${PORT}`) return route.continue();
    asked.add(url.host);
    if (url.host === 'fonts.googleapis.com' && FONT_CSS)
      return route.fulfill({ contentType: 'text/css', body: FONT_CSS });
    if (/fonts\.(googleapis|gstatic)\.com$/.test(url.host)) return route.continue();
    return route.abort();
  });
}

// Listings and Little Black Book entries are read off disk, so a new one the
// export brings in is checked without anyone having to remember to add it here.
const under = (dir) => fs.existsSync(path.join(ROOT, dir))
  ? fs.readdirSync(path.join(ROOT, dir))
      .filter(n => fs.existsSync(path.join(ROOT, dir, n, 'index.html')))
      .sort().map(n => `/${dir}/${n}`)
  : [];

const routes = ['/', '/about', '/buy', '/sell', '/listings', '/journal',
  ...under('listings'), ...under('journal'), '/404.html'];

const browser = await chromium.launch(
  process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const failures = [];
const note = (what, detail) => failures.push(`${what}: ${detail}`);

async function open(route, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, ...opts });
  const page = await ctx.newPage();
  const asked = new Set();
  await intercept(page, asked);
  await page.goto(ORIGIN + route, { waitUntil: 'load' });
  await page.waitForTimeout(350);
  return { ctx, page, asked };
}

// ---- every route, desktop then phone --------------------------------------
for (const route of routes) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  const asked = new Set(), errors = [], failed = [];
  page.on('pageerror', e => errors.push(String(e.message)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('requestfailed', r => {
    if (new URL(r.url()).host === `localhost:${PORT}`) failed.push(r.url());
  });
  await intercept(page, asked);
  await page.goto(ORIGIN + route, { waitUntil: 'load' });
  await page.waitForTimeout(350);

  const broken = await page.evaluate(() =>
    [...document.images].filter(i => !i.complete || i.naturalWidth === 0).map(i => i.src));
  const name = route === '/' ? 'home' : route.replace(/^\//, '').replace(/\//g, '__');
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });

  const outside = [...asked].filter(h => !/fonts\.(googleapis|gstatic)\.com$/.test(h));
  if (outside.length) note(route, `unexpected outside request to ${outside.join(', ')}`);
  if (broken.length) note(route, `broken images ${broken.join(', ')}`);
  if (failed.length) note(route, `failed requests ${failed.join(', ')}`);
  for (const e of errors) if (!/ERR_(FAILED|BLOCKED)/.test(e)) note(route, `console ${e}`);
  await ctx.close();

  const m = await open(route, { viewport: { width: 390, height: 844 } });
  const overflow = await m.page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 0) {
    const culprits = await m.page.evaluate(() => {
      const w = document.documentElement.clientWidth, out = [];
      document.querySelectorAll('*').forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.right > w + 1 && r.width > 4)
          out.push(`${el.tagName.toLowerCase()} "${(el.textContent || '').trim().slice(0, 40)}"`);
      });
      return out.slice(0, 3);
    });
    note(route, `${overflow}px horizontal overflow at 390px — ${culprits.join('; ')}`);
  }
  await m.ctx.close();
}

// ---- contact modal --------------------------------------------------------
{
  const { ctx, page } = await open('/buy');
  const dialog = page.locator('[data-if="modalOpen"] > div');
  if (await dialog.isVisible()) note('/buy', 'modal is visible before it is opened');
  await page.getByText('Start a conversation').first().click();
  if (!(await dialog.isVisible())) note('/buy', 'modal did not open');
  await page.locator('input[placeholder="First name"]').fill('Jane');
  await page.locator('input[placeholder="(000) 000-0000"]').pressSequentially('4805551234');
  const phone = await page.locator('input[placeholder="(000) 000-0000"]').inputValue();
  if (phone !== '(480) 555-1234') note('/buy', `phone formatted as "${phone}"`);
  await page.locator('button', { hasText: "Let's Chat" }).click();
  if (!(await page.locator('[data-if="showError"] p').isVisible()))
    note('/buy', 'incomplete form submitted without showing an error');
  await page.screenshot({ path: `${OUT}/buy-modal.png` });
  await page.keyboard.press('Escape');
  if (await dialog.isVisible()) note('/buy', 'Escape did not close the modal');
  await ctx.close();
}

// ---- property film --------------------------------------------------------
{
  const { ctx, page } = await open('/listings');
  if (!(await page.locator('.film-overlay').isVisible()))
    note('/listings', 'film poster is not visible before play');
  await page.locator('.film-overlay').click();
  await page.waitForTimeout(400);
  const src = await page.locator('[data-if="videoPlaying"] iframe').getAttribute('src');
  if (!src || !src.includes('youtube-nocookie.com/embed/'))
    note('/listings', `video src after play was "${src}"`);
  if (await page.locator('.film-overlay').isVisible())
    note('/listings', 'film poster still visible after play');
  await ctx.close();
}

// ---- navigation chrome ----------------------------------------------------
{
  const { ctx, page } = await open('/buy');
  if (await page.locator('.mnav-toggle').isVisible())
    note('/buy', 'the mobile menu checkbox is showing on desktop');
  if (await page.locator('.burger').isVisible())
    note('/buy', 'the burger icon is showing on desktop');
  if (!(await page.locator('.navmenu').isVisible()))
    note('/buy', 'the desktop nav menu is hidden');
  await ctx.close();
}
{
  const { ctx, page } = await open('/', { viewport: { width: 390, height: 844 } });
  if (!(await page.locator('.burger').isVisible())) note('mobile', 'no burger icon');
  if (await page.locator('.navmenu').isVisible()) note('mobile', 'menu is open by default');
  await page.locator('.burger').click();
  if (!(await page.locator('.navmenu').isVisible())) note('mobile', 'menu did not open on tap');
  await page.screenshot({ path: `${OUT}/home-mobile.png`, fullPage: true });
  await ctx.close();
}

// ---- renders without JavaScript -------------------------------------------
{
  const ctx = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  await intercept(page, new Set());
  await page.goto(ORIGIN + '/', { waitUntil: 'load' });
  const words = (await page.locator('body').innerText()).split(/\s+/).filter(Boolean).length;
  if (words < 300) note('no-js', `homepage rendered only ${words} words with JavaScript off`);
  await page.screenshot({ path: `${OUT}/home-nojs.png`, fullPage: true });
  await ctx.close();
  console.log(`Homepage renders ${words} words with JavaScript disabled.`);
}

await browser.close();
server.close();

if (failures.length) {
  console.log(`\n${failures.length} problem(s):`);
  for (const f of failures) console.log('  ' + f);
  process.exit(1);
}
console.log(`\nAll ${routes.length} routes clean. Screenshots in ${OUT}/`);

const { chromium } = require('playwright');

const BASE = process.env.BASE || 'http://localhost:5188';
const ROUTES = [
  '/',
  '/onboarding',
  '/projects',
  '/projects/new',
  '/settings',
  '/projects/1',
  '/projects/1/activity',
  '/projects/1/kanban',
  '/projects/1/agents',
  '/projects/1/canvas',
  '/nonexistent-route',
];

async function auditRoute(page, route) {
  const errors = [];
  const consoleErrors = [];
  page.removeAllListeners('console');
  page.removeAllListeners('pageerror');
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => {
    errors.push(String(err.message || err));
  });

  let status = 'n/a';
  try {
    const resp = await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 20000 });
    status = resp ? resp.status() : 'no-response';
  } catch (e) {
    status = 'ERR:' + e.message.split('\n')[0];
  }

  await page.waitForTimeout(800);

  const metrics = await page.evaluate(() => {
    const de = document.documentElement;
    const sw = de.scrollWidth;
    const cw = de.clientWidth;
    const overflowX = sw > cw + 1;
    // off-screen elements
    let offscreen = 0;
    // tiny tap targets
    let tinyTargets = 0;
    const interactive = document.querySelectorAll('a, button, [role="button"], input, select, textarea, [onclick]');
    const offEls = [];
    interactive.forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return;
      if (r.left < -2 || r.top < -2 || r.right > window.innerWidth + 2) {
        offscreen++;
        if (offEls.length < 5) offEls.push((el.tagName + '.' + (el.className || '').toString().slice(0,40)));
      }
      const minDim = Math.min(r.width, r.height);
      if (minDim > 0 && minDim < 36) {
        tinyTargets++;
      }
    });
    // table overflow
    let tableOverflow = 0;
    document.querySelectorAll('table').forEach((t) => {
      if (t.scrollWidth > t.clientWidth + 1) tableOverflow++;
    });
    return {
      scrollWidth: sw,
      clientWidth: cw,
      overflowX,
      offscreen,
      tinyTargets,
      tableOverflow,
      offEls,
    };
  });

  return { route, status, consoleErrors, errors, ...metrics };
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();

  // skip onboarding gate
  await page.addInitScript(() => {
    try { localStorage.setItem('onboarding_complete', '1'); } catch (e) {}
  });

  const results = [];
  for (const route of ROUTES) {
    results.push(await auditRoute(page, route));
  }

  await browser.close();

  console.log(JSON.stringify(results, null, 2));

  // summary
  let fail = 0;
  for (const r of results) {
    const problems = [];
    if (r.overflowX) problems.push('overflowX(' + r.scrollWidth + '>' + r.clientWidth + ')');
    if (r.offscreen > 0) problems.push('offscreen(' + r.offscreen + ')');
    if (r.tinyTargets > 0) problems.push('tinyTargets(' + r.tinyTargets + ')');
    if (r.tableOverflow > 0) problems.push('tableOverflow(' + r.tableOverflow + ')');
    if (r.errors.length) problems.push('pageerror(' + r.errors.length + ')');
    if (r.consoleErrors.length) problems.push('consoleErr(' + r.consoleErrors.length + ')');
    const status = problems.length ? 'FAIL' : (r.status >= 400 || String(r.status).startsWith('ERR') ? 'WARN' : 'PASS');
    if (status === 'FAIL') fail++;
    console.log(`[${status}] ${r.route} status=${r.status} ${problems.join(', ') || ''}`);
  }
  console.log(`\nSUMMARY: ${fail} failing routes`);
})();

// _verify_mobile.cjs — universal per-element mobile gate (adapted from mobile-ui-standards-bible §2)
// No auth (public app). Runs against the LIVE prod URL.
const { chromium } = require('playwright');
const fs = require('fs');

const BASE = (process.env.TARGET_URL || 'https://pwa-studio-pi.vercel.app').replace(/\/$/, '');
const VW = 390;
// Static routes from App.tsx router + representative dynamic routes (API gated on static deploy)
const ROUTES = [
  '/projects',
  '/widgets',
  '/settings',
  '/dashboard',
  '/studio/demo',
  '/studio/demo/flow',
  '/does-not-exist-xyz',
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const gates = {};
  for (const route of ROUTES) {
    const ctx = await browser.newContext({ viewport: { width: VW, height: 844 }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    const errs = [];
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    page.on('pageerror', (e) => errs.push('PE:' + e.message));
    page.on('requestfailed', (r) => {
      const u = r.url();
      const fail = (r.failure() && r.failure().errorText) || 'unknown';
      errs.push('REQFAIL:' + fail + ' ' + u);
    });
    try {
      await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 25000 });
    } catch (e) {}
    await page.waitForTimeout(2500);

    const res = await page.evaluate((vw) => {
      const docOverflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
      const inScroll = (el) => {
        let p = el.parentElement;
        while (p) {
          const cs = getComputedStyle(p);
          if ((cs.overflowX === 'auto' || cs.overflowX === 'scroll' || cs.overflowX === 'hidden') && p.getBoundingClientRect().width <= vw + 1) return true;
          p = p.parentElement;
        }
        return false;
      };
      const off = [];
      const walk = (el) => {
        const cs = getComputedStyle(el);
        const pos = cs.position;
        if (pos === 'fixed' || pos === 'absolute' || pos === 'sticky') {
          for (const c of el.children) walk(c);
          return;
        }
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0 && el.offsetParent !== null && r.right > vw + 1 && !inScroll(el))
          off.push({ tag: el.tagName.toLowerCase(), right: Math.round(r.right), w: Math.round(r.width) });
        for (const c of el.children) walk(c);
      };
      walk(document.body);
      const taps = [...document.querySelectorAll('button,a,[role=button]')]
        .map((e) => { const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; })
        .filter((t) => t.h > 0);
      const smallTaps = taps.filter((t) => t.w < 44 || t.h < 44).length;
      return { docOverflow, realOff: off.length, offList: off.slice(0, 15), totalTaps: taps.length, smallTaps, tapList: taps.filter((t) => t.w < 44 || t.h < 44).slice(0, 15) };
    }, VW);
    gates[route] = { ...res, consoleErrs: errs.length, errSamples: errs.slice(0, 10) };
    await ctx.close();
  }
  await browser.close();
  const bad = Object.entries(gates).filter(([_, g]) => g.realOff > 0 || g.docOverflow > 2 || g.consoleErrs > 0 || g.smallTaps > 0);
  fs.writeFileSync('verify-report.json', JSON.stringify(gates, null, 2));
  console.log('ROUTES=' + ROUTES.length + ' FAILING=' + bad.length);
  process.exit(bad.length ? 1 : 0);
})();

const puppeteer = require('/home/pi/WorkDir/browser-tool/node_modules/puppeteer-core');
const URL = process.argv[2], TIMEOUT = parseInt(process.argv[3] || '120', 10) * 1000;
const EXTRA = process.argv.slice(4);
(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium-browser', headless: 'new',
    args: ['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--use-gl=swiftshader', ...EXTRA],
  });
  const page = await browser.newPage();
  page.on('console', m => console.log('[console]', m.text()));
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const t0 = Date.now();
  let txt = '';
  while (Date.now() - t0 < TIMEOUT) {
    txt = await page.$eval('#log', el => el.textContent).catch(() => '');
    if (/DONE/.test(txt)) break;
    await new Promise(r => setTimeout(r, 1000));
  }
  console.log(txt);
  await browser.close();
})();

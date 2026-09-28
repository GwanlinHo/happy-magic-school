// 冒煙測試：手勢測試頁在沒有鏡頭的情況下也要能開、觸控模式要能用。
const puppeteer = require('/home/pi/WorkDir/browser-tool/node_modules/puppeteer-core');
(async () => {
  const errors = [];
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium-browser', headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader', '--use-gl=swiftshader'],
  });
  const page = await browser.newPage();
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  // favicon 的 404 與測試無關，忽略
  page.on('console', m => {
    const where = (m.location() && m.location().url) || '';
    if (m.type() === 'error' && !/favicon/.test(where + m.text())) errors.push('console: ' + m.text() + ' @ ' + where);
  });
  page.on('requestfailed', r => { if (!/favicon/.test(r.url())) errors.push('requestfailed: ' + r.url()); });
  await page.setViewport({ width: 1280, height: 1200 });
  await page.goto(process.argv[2], { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise(r => setTimeout(r, 2500));

  const check = [];
  const push = (ok, msg) => check.push((ok ? 'PASS ' : 'FAIL ') + msg);

  push(await page.$('#runes .rune') !== null, '五符文列表有渲染出來');
  push((await page.$$('#runes .rune')).length === 5, '符文數量為 5');

  // 切到觸控模式，按住「光」兩秒
  await page.click('#modeBtn');
  push(await page.$eval('#touchRow', el => !el.hidden), '切換後觸控按鈕列出現');
  const btn = (await page.$$('#touchRow button'))[0];
  await btn.evaluate(el => el.scrollIntoView({ block: 'center' }));
  await new Promise(r => setTimeout(r, 200));
  const box = await btn.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await new Promise(r => setTimeout(r, 2000));
  await page.mouse.up();
  await new Promise(r => setTimeout(r, 300));
  const txt = await page.$eval('#rv-light', el => el.textContent);
  const secs = parseFloat((txt.match(/最長 ([\d.]+)/) || [])[1] || '0');
  push(secs >= 1.5, `觸控按住 2 秒應累積維持時間（實得最長 ${secs} 秒，顯示「${txt}」）`);

  // 畫形：在畫布上畫一個圓
  const pad = await page.$('#pad');
  await pad.evaluate(el => el.scrollIntoView({ block: 'center' }));
  await new Promise(r => setTimeout(r, 200));
  const pb = await pad.boundingBox();
  const cx = pb.x + pb.width / 2, cy = pb.y + pb.height / 2, r = pb.width * 0.32;
  await page.mouse.move(cx + r, cy);
  await page.mouse.down();
  for (let i = 1; i <= 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    await page.mouse.move(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  await page.mouse.up();
  await new Promise(r => setTimeout(r, 300));
  const shape = await page.$eval('#shapeOut', el => el.textContent);
  push(/圓/.test(shape), `畫圓應被辨識為「圓」（實得「${shape}」）`);

  // 沒有鏡頭時要給得出人看得懂的提示
  await page.click('#start');
  await new Promise(r => setTimeout(r, 3000));
  const status = await page.$eval('#status', el => el.textContent);
  push(/失敗|觸控/.test(status), `無鏡頭時應顯示可理解的提示（實得「${status.slice(0, 60)}」）`);

  push(errors.length === 0, ' 頁面無 JS 錯誤' + (errors.length ? '：\n  ' + errors.join('\n  ') : ''));
  console.log(check.join('\n'));
  console.log(check.some(c => c.startsWith('FAIL')) ? 'RESULT FAIL' : 'RESULT PASS');
  await browser.close();
})();

const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');

(async () => {
  fs.mkdirSync('artifacts', { recursive: true });
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 820 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:4187/?device=gt6-pro');
    await page.locator('.empty-title').waitFor();
    assert.match(await page.locator('#watch').innerText(), /尚未同步课表/);
    await page.screenshot({ path: 'artifacts/watch-empty.png' });
    await page.locator('.sync-icon-button').click();
    assert.match(await page.locator('.sync-state').textContent(), /^等待(鸿蒙|安卓)手机$/);
    for (const viewport of [{ width: 1200, height: 820 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      // Render each native status string on the shared HML/CSS surface.
      for (const state of ['鸿蒙手机待接入', '安卓手机待接入', '等待鸿蒙手机', '等待安卓手机']) {
        await page.locator('.sync-state').evaluate((el, text) => { el.textContent = text; }, state);
        const size = await page.locator('.sync-state').evaluate(el => ({
          width: el.clientWidth, scrollWidth: el.scrollWidth, height: el.clientHeight, scrollHeight: el.scrollHeight
        }));
        assert.ok(size.scrollWidth <= size.width && size.scrollHeight <= size.height, state + ' must fit');
      }
      await page.locator('.sync-state').evaluate(el => { el.textContent = '鸿蒙手机待接入'; });
      await page.locator('.sync-detail').evaluate(el => { el.textContent = '同步身份尚未配置'; });
      await page.screenshot({ path: `artifacts/watch-harmony-${viewport.width}.png`, fullPage: true });
    }
    await page.setViewportSize({ width: 1200, height: 820 });
    await page.locator('.back-button').click();
    await page.click('#demo');
    await page.waitForFunction(() => document.querySelector('#result').textContent.startsWith('同步完成'));
    assert.equal(await page.locator('.day').count(), 7);
    assert.equal(await page.locator('.course').count(), 3);
    await page.screenshot({ path: 'artifacts/watch-desktop.png' });
    await page.locator('#watch').screenshot({ path: 'artifacts/watch-face.png' });
    const list = page.locator('.course-list');
    const dimensions = await list.evaluate(el => ({ content: el.scrollHeight, viewport: el.clientHeight }));
    assert.ok(dimensions.content > dimensions.viewport);
    await list.evaluate(el => { el.scrollTop = el.scrollHeight; });
    assert.equal(await page.locator('.course-title').last().textContent(), '离散数学');
    await page.screenshot({ path: 'artifacts/watch-scroll-bottom.png' });
    const lastBottom = await page.locator('.course-bottom').last().boundingBox();
    const face = await page.locator('#watch').boundingBox();
    assert.ok(lastBottom.y + lastBottom.height < face.y + face.height - 55);
    await page.locator('.day').nth(4).click();
    const text = await page.locator('#watch').innerText();
    assert.match(text, /计算机系统基础与程序设计综合实验/);
    assert.match(text, /实验教学中心A区计算机实验室302/);
    assert.match(text, /课程教学组：张老师、李老师/);
    for (const selector of ['.course-title', '.course-room', '.course-teacher']) {
      const size = await page.locator(selector).evaluate(el => ({ height: el.clientHeight, scroll: el.scrollHeight }));
      assert.ok(size.scroll <= size.height, `${selector} text must not be clipped`);
    }
    await page.screenshot({ path: 'artifacts/watch-long-text.png' });
    await page.locator('.day').nth(5).click();
    assert.match(await page.locator('#watch').innerText(), /今日无课/);
    await page.locator('.day').nth(6).click();
    assert.match(await page.locator('#watch').innerText(), /离散数学/);
    await page.locator('.sync-icon-button').click();
    assert.match(await page.locator('#watch').innerText(), /课表同步/);
    await page.screenshot({ path: 'artifacts/watch-sync.png' });
    await page.locator('.back-button').click();
    assert.equal(await page.locator('.day').count(), 7);
    await page.click('#interrupt');
    await page.click('#demo');
    await page.waitForFunction(() => document.querySelector('#result').textContent.includes('INTERRUPTED'));
    assert.match(await page.locator('#watch').innerText(), /离散数学/);
    await page.reload();
    await page.locator('.course').first().waitFor();
    assert.equal(await page.locator('.course').count(), 3);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: 'artifacts/watch-mobile.png', fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const { previewDevices } = await import('../preview/devices.mjs');
    for (const device of previewDevices) {
      for (const viewport of [{ width: 1200, height: 820 }, { width: 390, height: 844 }]) {
        await page.setViewportSize(viewport);
        await page.selectOption('#device-select', device.id);
        await page.locator('.day').nth(4).click();
        const geometry = await page.locator('#watch').evaluate(el => ({
          width: el.clientWidth, height: el.clientHeight,
          screenWidth: el.querySelector('.screen').clientWidth,
          screenHeight: el.querySelector('.screen').clientHeight
        }));
        assert.deepEqual(geometry, {
          width: device.windowWidth, height: device.windowHeight,
          screenWidth: device.windowWidth, screenHeight: device.windowHeight
        });
        for (const selector of ['.heading', '.week-label', '.day-name', '.day-number',
          '.course-title', '.course-room', '.course-teacher', '.course-time', '.course-kind', '.course-state']) {
          const overflow = await page.locator(selector).evaluateAll(elements =>
            elements.some(el => el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight));
          assert.equal(overflow, false, device.id + ' overflow in ' + selector);
        }
        await page.screenshot({ path: `artifacts/adaptive-${device.id}-${viewport.width}.png`, fullPage: true });
        await page.locator('.course-list').evaluate(el => { el.scrollTop = el.scrollHeight; });
        await page.screenshot({ path: `artifacts/adaptive-${device.id}-bottom-${viewport.width}.png`, fullPage: true });
        await page.locator('.sync-icon-button').click();
        await page.locator('.sync-list').evaluate(el => { el.scrollTop = el.scrollHeight; });
        const action = await page.locator('.sync-action').boundingBox();
        const watch = await page.locator('#watch').boundingBox();
        assert.ok(action.x >= watch.x && action.x + action.width <= watch.x + watch.width + 1);
        assert.ok(action.y + action.height < watch.y + watch.height - 10);
        await page.screenshot({ path: `artifacts/adaptive-${device.id}-sync-${viewport.width}.png`, fullPage: true });
        await page.locator('.back-button').click();
        assert.equal(await page.locator('.day').count(), 7);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      }
    }
    assert.deepEqual(errors, []);
    console.log('PASS: shared HML render, sync/cache, five round/rectangular device sizes, long text, scrolling, sync/back and desktop/390px layouts.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

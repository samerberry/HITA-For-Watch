import assert from 'node:assert/strict';
import test from 'node:test';
import { displayLayout } from '../entry/src/main/js/MainAbility/common/display-layout.js';
import { viewData } from '../entry/src/main/js/MainAbility/common/view-model.js';
import { previewDevices } from '../preview/devices.mjs';
import { fixture, NOW } from './fixtures.mjs';

test('FIT 5 Pro portrait layout uses the reported 408 x 480 viewport', () => {
  const layout = displayLayout(previewDevices[0]);
  assert.equal(layout.shape, 'rect');
  assert.equal(layout.width, 408);
  assert.equal(layout.height, 480);
  assert.equal(layout.contentWidth, 376);
  assert.equal(layout.listTop + layout.listHeight, 480);
});

test('equal width and height never override an explicitly rectangular screen shape', () => {
  const rect = displayLayout(previewDevices[4]);
  const circle = displayLayout({ windowWidth: 400, windowHeight: 400, screenShape: 'circle' });
  assert.equal(rect.shape, 'rect');
  assert.ok(rect.contentWidth > circle.contentWidth);
  assert.ok(rect.topInset < circle.topInset);
  assert.ok(rect.syncBottomInset < circle.syncBottomInset);
});

test('invalid device fields and missing callbacks have finite conservative fallback geometry', () => {
  for (const info of [null, {}, { windowWidth: '408', windowHeight: -1 },
    { windowWidth: Infinity, windowHeight: NaN }, { screenShape: 'unknown' }]) {
    const layout = displayLayout(info);
    assert.equal(layout.width, 466);
    assert.equal(layout.height, 466);
    assert.equal(layout.shape, 'circle');
  }
});

test('all preview sizes contain seven dates, content, headers and scrollable bodies', () => {
  for (const device of previewDevices) {
    const layout = displayLayout(device);
    assert.ok(layout.weekWidth <= layout.contentWidth);
    assert.equal((layout.dayWidth + 2) * 7, layout.weekWidth);
    assert.equal(layout.headingWidth + layout.weekLabelWidth + 44, layout.topWidth);
    assert.ok(layout.contentWidth <= layout.width);
    assert.ok(layout.courseKindWidth + 114 <= layout.courseTextWidth);
    assert.ok(layout.listHeight > 180);
    assert.equal(layout.syncBodyHeight + layout.topInset + 50, layout.height);
  }
});

test('long course and sync metadata heights follow content width without changing text or font size', () => {
  const data = fixture();
  data.timetable.name = '计算机学院本科生课程与考试安排';
  const narrow = displayLayout(previewDevices[2]);
  const wide = displayLayout(previewDevices[0]);
  const a = viewData(data, '2026-10-09', NOW, narrow);
  const b = viewData(data, '2026-10-09', NOW, wide);
  assert.equal(a.events[0].title, b.events[0].title);
  assert.equal(a.events[0].room, b.events[0].room);
  assert.ok(a.events[0].titleHeight >= b.events[0].titleHeight);
  assert.ok(a.events[0].roomHeight >= b.events[0].roomHeight);
  assert.ok(a.savedTitleHeight >= b.savedTitleHeight);
});

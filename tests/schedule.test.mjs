import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture, NOW } from './fixtures.mjs';
import {
  checksum, dayKey, dayTime, weekStart, weekDays, selectedDayView, parseSnapshot,
  splitUtf8, utf8Bytes, DAY_MS
} from '../entry/src/main/js/MainAbility/common/schedule.js';
import { viewData } from '../entry/src/main/js/MainAbility/common/view-model.js';

test('school timezone and Monday week boundaries do not depend on host timezone', () => {
  assert.equal(dayKey(Date.parse('2026-10-04T16:00:00Z')), '2026-10-05');
  assert.equal(dayTime('2026-10-05'), Date.parse('2026-10-04T16:00:00Z'));
  assert.equal(weekStart(Date.parse('2026-10-11T23:59:00+08:00')), dayTime('2026-10-05'));
  assert.equal(weekStart(Date.parse('2026-10-12T00:00:00+08:00')), dayTime('2026-10-12'));
  assert.ok(Number.isNaN(dayTime('2026-02-30')));
  assert.ok(Number.isNaN(dayTime('not-a-date')));
});
test('current week contains all seven dates, including month and year boundaries', () => {
  const days = weekDays(Date.parse('2027-01-01T10:00:00+08:00'), '2027-01-01', null);
  assert.deepEqual(days.map(d => d.key), [
    '2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03'
  ]);
  assert.equal(days.filter(d => d.selected).length, 1);
  assert.equal(days[6].weekday, '日');
});
test('UTF-8 segmentation preserves Chinese, emoji and byte limits', () => {
  for (const text of ['abc', '教室M楼-306', '教室📚🕒'.repeat(500)]) {
    assert.equal(utf8Bytes(text), Buffer.byteLength(text));
    const chunks = splitUtf8(text, 384);
    assert.equal(chunks.join(''), text);
    assert.ok(chunks.every(c => Buffer.byteLength(c) <= 384));
  }
  assert.equal(checksum('123456789'), 'cbf43926');
  assert.equal(checksum(''), '00000000');
});
test('snapshot parser validates and strips unrelated phone credentials', () => {
  const raw = { ...fixture(), cookie: 'never-persist', password: 'never-persist' };
  raw.events[0].token = 'never-persist';
  const data = parseSnapshot(JSON.stringify(raw));
  assert.equal(data.events.length, 8);
  assert.ok(!JSON.stringify(data).includes('never-persist'));
});
test('malformed snapshots are rejected before replacing old courses', () => {
  const mutations = [
    d => { d.version = 2; }, d => { d.timezone = 'UTC'; }, d => { d.events = null; },
    d => { d.events[0].endAt = d.events[0].startAt; },
    d => { d.events.push(d.events[0]); }, d => { d.rangeStart = '2026-02-30'; },
    d => { d.rangeEnd = '2027-12-01'; }, d => { d.timetable.termStart = '2026-09-01'; },
    d => { d.events[0].title = ''; }, d => { d.events[0].kind = 'INVALID'; },
    d => { d.events[0].startAt -= 100 * DAY_MS; }, d => { d.generatedAt = Infinity; }
  ];
  for (const mutate of mutations) {
    const d = fixture();
    mutate(d);
    assert.throws(() => parseSnapshot(JSON.stringify(d)));
  }
});
test('unknown, unsynchronized dates and confirmed empty days have distinct states', () => {
  assert.equal(selectedDayView(null, '2026-10-05', NOW).emptyTitle, '尚未同步课表');
  assert.equal(selectedDayView(fixture(), '2026-10-19', NOW).emptyTitle, '这一天尚未同步');
  assert.equal(selectedDayView(fixture(), '2026-10-08', NOW).emptyTitle, '今日无课');
});
test('course detail keeps full room, teacher, title, section and actual Weihai time', () => {
  const data = viewData(fixture(), '2026-10-05', NOW);
  assert.equal(data.weekLabel, '第6周');
  assert.equal(data.events[0].state, '进行中');
  assert.equal(data.events[2].time, '16:05 - 17:50');
  assert.equal(data.events[2].room, 'N楼-118');
  const long = viewData(fixture(), '2026-10-09', NOW).events[0];
  assert.equal(long.room, '实验教学中心A区计算机实验室302');
  assert.ok(long.titleHeight >= 64);
  assert.ok(long.roomHeight >= 56);
});
test('saved and out-of-range dates render without String.replace in the Lite runtime', () => {
  const replace = String.prototype.replace;
  let view, outside;
  try {
    String.prototype.replace = undefined;
    view = viewData(fixture(), '2026-10-05', NOW);
    outside = selectedDayView(fixture(), '2026-10-19', NOW);
  } finally { String.prototype.replace = replace; }
  assert.equal(view.rangeText, '10/05 - 10/18');
  assert.match(view.syncText, /^更新于 10\/05 /);
  assert.equal(outside.emptyText, '已保存 10/05 至 10/18');
});
test('exams omit section numbers and ended course status is correct', () => {
  const data = fixture();
  data.events[5].sections = 'not displayed';
  const exam = selectedDayView(data, '2026-10-07', NOW).events[1];
  assert.equal(exam.kindText, '考试');
  assert.equal(exam.sections, '');
  assert.equal(selectedDayView(data, '2026-10-05', NOW + 4 * 3600000).events[0].state, '已结束');
});
test('overnight events appear on both dates without appearing at the exclusive end', () => {
  const data = fixture();
  data.events = [{ ...data.events[0], startAt: dayTime('2026-10-05') + 23 * 3600000,
    endAt: dayTime('2026-10-06') + 3600000 }];
  assert.equal(selectedDayView(data, '2026-10-05', NOW).events.length, 1);
  assert.equal(selectedDayView(data, '2026-10-06', NOW).events.length, 1);
  assert.equal(selectedDayView(data, '2026-10-07', NOW).events.length, 0);
});

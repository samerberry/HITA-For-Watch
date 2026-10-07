import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture, NOW } from './fixtures.mjs';
import { checksum, splitUtf8, utf8Bytes, parseSnapshot } from '../entry/src/main/js/MainAbility/common/schedule.js';
import { createReceiver, packet, CHUNK_BYTES, TRANSFER_TIMEOUT } from '../entry/src/main/js/MainAbility/common/sync-protocol.js';
import { createSnapshotStore } from '../entry/src/main/js/MainAbility/common/snapshot-store.js';

function fakeStorage() {
  const data = new Map();
  const state = { data, writes: 0, failAt: -1, readFailure: false };
  state.get = ({ key, success, fail }) => queueMicrotask(() => {
    if (state.readFailure) fail('disk error');
    else success(data.get(key) || '');
  });
  state.set = ({ key, value, success, fail }) => queueMicrotask(() => {
    assert.ok(Buffer.byteLength(value) <= 128, 'Lite Preferences values must fit the native 128-byte read limit.');
    assert.ok(key.length <= 32);
    if (++state.writes === state.failAt) fail('disk full');
    else { data.set(key, value); success(); }
  });
  return state;
}
const load = store => new Promise((resolve, reject) => store.load((e, value) => e ? reject(e) : resolve(value)));
const save = (store, data) => new Promise((resolve, reject) => store.save(data, (e, value) => e ? reject(e) : resolve(value)));
test('large Chinese snapshots survive a native 128-byte storage boundary and more than forty fragments', async () => {
  const disk = fakeStorage();
  const data = fixture();
  data.events[0].title = '多字节课程名称'.repeat(12);
  data.events[0].room = '实验教学中心'.repeat(18);
  data.events[0].teacher = '课程教学组'.repeat(18);
  for (let i = 0; i < 12; i++) data.events.push({ ...data.events[0], id: 'long_' + i });
  const writer = createSnapshotStore(disk);
  await load(writer);
  await save(writer, data);
  const meta = JSON.parse(disk.data.get('hita_a_meta'));
  assert.ok(meta.count > 40);
  assert.ok([...disk.data.values()].every(value => Buffer.byteLength(value) <= 128));
  const reader = createSnapshotStore(disk);
  assert.deepEqual(await load(reader), parseSnapshot(JSON.stringify(data)));
});
test('storage read errors cannot turn an existing cache into a writable empty installation', async () => {
  const disk = fakeStorage();
  const first = createSnapshotStore(disk);
  await load(first);
  await save(first, fixture());
  const original = new Map(disk.data);
  disk.readFailure = true;
  const reopened = createSnapshotStore(disk);
  await assert.rejects(load(reopened), /STORAGE_READ/);
  await assert.rejects(save(reopened, fixture()), /STORAGE_BUSY/);
  assert.deepEqual(disk.data, original);
});
function setup(persist) {
  const replies = [], states = [], saved = [];
  const receiver = createReceiver({
    send: text => replies.push(JSON.parse(text)),
    state: (state, reason) => states.push([state, reason]),
    persist: persist || ((data, done) => done(null, data)),
    complete: data => saved.push(data)
  });
  const send = p => receiver.receive(JSON.stringify(p), NOW);
  return { receiver, send, replies, states, saved };
}
function frames(snapshot = fixture(), id = 'test_1') {
  const text = JSON.stringify(snapshot);
  const parts = splitUtf8(text, CHUNK_BYTES);
  return [
    { ...packet('begin', id), total: parts.length, bytes: utf8Bytes(text), crc: checksum(text) },
    ...parts.map((data, n) => ({ ...packet('chunk', id), data, n })),
    packet('end', id)
  ];
}

test('reassembled Chinese messages are acknowledged only after durable persistence', () => {
  let commit;
  const s = setup((data, done) => { commit = () => done(null, data); });
  for (const p of frames()) s.send(p);
  assert.equal(s.saved.length, 0);
  assert.ok(!s.replies.some(p => p.t === 'done'));
  commit();
  assert.equal(s.saved.length, 1);
  assert.equal(s.replies.at(-1).t, 'done');
  assert.equal(s.saved[0].events[2].room, 'N楼-118');
});
test('duplicate chunks and duplicate commit are idempotent', () => {
  const s = setup(), list = frames();
  s.send(list[0]); s.send(list[1]); s.send(list[1]);
  for (const p of list.slice(2)) s.send(p);
  s.send(list.at(-1));
  assert.equal(s.saved.length, 1);
  assert.equal(s.replies.at(-1).t, 'done');
});
test('out-of-order chunks request the expected sequence without losing earlier data', () => {
  const s = setup(), list = frames();
  s.send(list[0]); s.send(list[2]);
  assert.equal(s.replies.at(-1).next, 0);
  for (const p of list.slice(1)) s.send(p);
  assert.equal(s.saved.length, 1);
});
test('incomplete and corrupted transfers never replace cached data', () => {
  const s = setup(), list = frames();
  s.send(list[0]); s.send(list[1]); s.send(list.at(-1));
  assert.equal(s.saved.length, 0);
  assert.equal(s.replies.at(-1).t, 'ack');
  list[0].crc = '00000000';
  const broken = setup();
  for (const p of list) broken.send(p);
  assert.equal(broken.saved.length, 0);
  assert.equal(broken.replies.at(-1).error, 'CHECKSUM');
});
test('invalid ranges, foreign traffic and oversized allocations are rejected', () => {
  const s = setup();
  s.send({ ...packet('begin', 'too_big'), total: 900000, bytes: 900000, crc: '00000000' });
  assert.equal(s.replies.at(-1).error, 'SIZE');
  s.receiver.receive('not JSON', NOW);
  s.send({ p: 'another-app', t: 'begin' });
  assert.equal(s.saved.length, 0);
  const d = fixture();
  d.events[0].endAt = d.events[0].startAt;
  for (const p of frames(d)) s.send(p);
  assert.equal(s.replies.at(-1).error, 'INVALID_DATA');
});
test('timeout, cancellation and storage failure are recoverable', () => {
  const s = setup((data, done) => done(new Error('STORAGE_WRITE')));
  s.send(frames()[0]);
  s.receiver.tick(NOW + TRANSFER_TIMEOUT + 1);
  assert.equal(s.replies.at(-1).error, 'TIMEOUT');
  for (const p of frames()) s.send(p);
  assert.equal(s.replies.at(-1).error, 'STORAGE');
  assert.equal(s.saved.length, 0);
  s.send(frames()[0]);
  s.receiver.cancel();
  s.send(frames()[1]);
  assert.equal(s.saved.length, 0);
});
test('two-slot cache survives restart and preserves the old slot after interrupted writes', async () => {
  const disk = fakeStorage();
  let store = createSnapshotStore(disk);
  assert.equal(await load(store), null);
  await save(store, fixture());
  const next = fixture();
  next.generatedAt++;
  next.events = [];
  disk.failAt = disk.writes + 3;
  await assert.rejects(save(store, next));
  store = createSnapshotStore(disk);
  assert.equal((await load(store)).events.length, 8);
  disk.failAt = -1;
  await save(store, next);
  store = createSnapshotStore(disk);
  assert.equal((await load(store)).events.length, 0);
});
test('damaged latest cache falls back to previous complete version', async () => {
  const disk = fakeStorage();
  let store = createSnapshotStore(disk);
  await load(store);
  await save(store, fixture());
  const next = fixture(); next.generatedAt++; next.events = [];
  await save(store, next);
  disk.data.set('hita_b_0', 'truncated');
  store = createSnapshotStore(disk);
  assert.equal((await load(store)).events.length, 8);
});
test('old phone snapshots cannot overwrite a newer saved revision', async () => {
  const store = createSnapshotStore(fakeStorage());
  await load(store);
  await save(store, fixture());
  const old = fixture(); old.generatedAt--;
  await assert.rejects(save(store, old), /STALE/);
});
test('all packet sizes remain bounded after JSON escaping', () => {
  const d = fixture();
  d.events[0].title = '课堂"\\📚'.repeat(10);
  for (const frame of frames(d)) assert.ok(Buffer.byteLength(JSON.stringify(frame)) <= 2048);
  assert.equal(parseSnapshot(JSON.stringify(d)).events[0].title, d.events[0].title);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { fixture, NOW } from './fixtures.mjs';
import { createReceiver, packet, CHUNK_BYTES } from '../entry/src/main/js/MainAbility/common/sync-protocol.js';
import { createSnapshotStore } from '../entry/src/main/js/MainAbility/common/snapshot-store.js';
import { checksum, splitUtf8, utf8Bytes } from '../entry/src/main/js/MainAbility/common/schedule.js';

let nativeState;
globalThis.__hitaWearNative = {
  getWearEngineVersion(options) {
    nativeState.versionRequest = options;
    if (!nativeState.deferVersion) options.complete('5.0.0.' + nativeState.version);
  },
  setPackageName(options) { nativeState.packageName = options.appName; options.complete(); },
  setFingerprint(options) { nativeState.identity = { packageName: options.appName, fingerprint: options.appCert }; options.complete(); },
  subscribeMsg(options) {
    nativeState.subscription = options;
    if (!nativeState.deferRegister) options.success({ isRegister: true });
  },
  unsubscribeMsg() { nativeState.unsubscribed++; },
  sendMsg(options) {
    nativeState.sent.push(options);
    if (nativeState.sendFails) options.fail('test failure', 206);
    else options.success();
  }
};
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '@system.wearengine') return { url: 'test:hita-wear-native', shortCircuit: true };
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === 'test:hita-wear-native') return {
      format: 'module', source: 'export default globalThis.__hitaWearNative;', shortCircuit: true
    };
    return nextLoad(url, context);
  }
});
// Exercise the real bundled Huawei SDK and watch transport; only the device service is mocked.
const { createWearTransport } = await import('../entry/src/main/js/MainAbility/common/wear-transport.js');
hooks.deregister();
const harmonyPeer = { platform: 'harmonyos', packageName: 'cn.example.next', fingerprint: '123456789012345' };
const androidPeer = { platform: 'android', packageName: 'cn.example.android', fingerprint: 'AB'.repeat(32) };

function setup(t, peer = harmonyPeer, overrides = {}) {
  nativeState = { version: 401, sent: [], unsubscribed: 0, ...overrides };
  const states = [], messages = [];
  const transport = createWearTransport(peer, text => messages.push(text), state => states.push(state));
  t.after(() => transport.stop());
  return { native: nativeState, states, messages, transport };
}

for (const peer of [harmonyPeer, androidPeer]) {
  test(peer.platform + ' identity reaches the native SDK unchanged and requests target that phone', t => {
    const s = setup(t, peer);
    s.transport.start();
    assert.deepEqual(s.native.identity, { packageName: peer.packageName, fingerprint: peer.fingerprint });
    assert.deepEqual(s.states, ['connecting', 'waiting']);
    const request = JSON.stringify(packet('request', 'watch_request'));
    let result = 'pending';
    s.transport.send(request, error => { result = error; });
    assert.equal(result, null);
    assert.equal(s.native.sent[0].bundleName, peer.packageName);
    assert.equal(s.native.sent[0].message, request);
    assert.ok(!s.states.includes('connected'), 'Subscription is not proof of peer connectivity');
  });
}

test('unconfigured or mismatched platform identities never open the native service', t => {
  for (const peer of [{ ...harmonyPeer, fingerprint: '' }, { ...harmonyPeer, fingerprint: androidPeer.fingerprint }]) {
    const s = setup(t, peer);
    assert.equal(s.transport.configured(), false);
    s.transport.start();
    assert.deepEqual(s.states, ['unconfigured']);
    assert.equal(s.native.versionRequest, undefined);
    s.transport.send('hello', error => assert.equal(error.message, 'NOT_READY'));
  }
});

test('unsupported native service is reported without claiming a phone connection', t => {
  const s = setup(t, harmonyPeer, { version: 303 });
  s.transport.start();
  assert.deepEqual(s.states, ['connecting', 'unavailable']);
  assert.equal(s.native.subscription, undefined);
});

test('late native registration and messages are ignored after leaving the foreground', t => {
  const s = setup(t, harmonyPeer, { deferRegister: true });
  s.transport.start();
  const old = s.native.subscription;
  s.transport.stop();
  old.success({ isRegister: true });
  old.success({ message: JSON.stringify(packet('begin', 'stale')) });
  assert.deepEqual(s.states, ['connecting']);
  assert.deepEqual(s.messages, []);
  s.native.deferRegister = false;
  s.transport.start();
  old.fail();
  assert.equal(s.states.at(-1), 'waiting');
});

test('a delayed native version cannot restart a stopped transport', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const s = setup(t, harmonyPeer, { deferVersion: true });
  s.transport.start();
  s.transport.stop();
  s.native.versionRequest.complete('5.0.0.401');
  t.mock.timers.tick(10000);
  assert.equal(s.native.subscription, undefined);
  assert.deepEqual(s.states, ['connecting']);
});

test('file messages are ignored and a failed native send settles once', t => {
  const s = setup(t, harmonyPeer, { sendFails: true });
  s.transport.start();
  s.native.subscription.success({ isFileType: true, file: 'ignored' });
  assert.deepEqual(s.messages, []);
  let failures = 0;
  s.transport.send(JSON.stringify(packet('request', 'watch_request')), error => {
    assert.equal(error.message, 'SEND_FAILED');
    failures++;
  });
  assert.equal(failures, 1);
});

test('HarmonyOS UTF-8 payloads traverse the SDK, receiver and cache before done is returned', async t => {
  const s = setup(t);
  s.transport.stop();
  const disk = new Map();
  const store = createSnapshotStore({
    get({ key, success }) { queueMicrotask(() => success(disk.get(key) || '')); },
    set({ key, value, success }) { queueMicrotask(() => { disk.set(key, value); success(); }); }
  });
  await new Promise(resolve => store.load(resolve));
  let saved;
  const receiver = createReceiver({
    send: text => transport.send(text),
    state() {},
    persist: (data, done) => store.save(data, done),
    complete: data => { saved = data; }
  });
  const transport = createWearTransport(harmonyPeer, text => receiver.receive(text, NOW), () => {});
  t.after(() => transport.stop());
  transport.start();
  const data = fixture();
  data.events[0].title += '\u{1f4da}';
  const raw = JSON.stringify(data);
  const parts = splitUtf8(raw, CHUNK_BYTES);
  const id = 'harmony_test';
  // ArkTS P2pMessage.content is UTF-8 bytes; the Lite SDK delivers a text message.
  function deliver(p) {
    const bytes = new TextEncoder().encode(JSON.stringify(p));
    s.native.subscription.success({ message: new TextDecoder().decode(bytes) });
  }
  deliver({ ...packet('begin', id), total: parts.length, bytes: utf8Bytes(raw), crc: checksum(raw) });
  assert.equal(JSON.parse(s.native.sent.at(-1).message).next, 0);
  for (let n = 0; n < parts.length; n++) {
    deliver({ ...packet('chunk', id), n, data: parts[n] });
    assert.equal(JSON.parse(s.native.sent.at(-1).message).next, n + 1);
  }
  deliver(packet('end', id));
  assert.equal(saved, undefined);
  assert.ok(!s.native.sent.some(p => JSON.parse(p.message).t === 'done'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(saved.events[0].title, data.events[0].title);
  assert.equal(JSON.parse(s.native.sent.at(-1).message).t, 'done');
  deliver(packet('end', id));
  assert.equal(JSON.parse(s.native.sent.at(-1).message).t, 'done');
  assert.ok(s.native.sent.every(p => p.bundleName === harmonyPeer.packageName));
  const restored = await new Promise(resolve => store.load((error, value) => resolve(value)));
  assert.deepEqual(restored, saved);
});

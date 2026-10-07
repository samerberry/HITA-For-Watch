import assert from 'node:assert/strict';
import test from 'node:test';
import { hasCharacters } from '../entry/src/main/js/MainAbility/common/characters.js';
import { validPackageName, isPeerConfigured, normalizePeer } from '../entry/src/main/js/MainAbility/common/peer-identity.js';
import { dayTime, checksum, utf8Bytes } from '../entry/src/main/js/MainAbility/common/schedule.js';
import { createReceiver, packet } from '../entry/src/main/js/MainAbility/common/sync-protocol.js';

test('Lite character validation rejects wrong types, lengths and characters', () => {
  assert.equal(hasCharacters('0123', '0123456789', 1, 4), true);
  for (const value of [null, 123, {}, '', '12345', '12\n', '12 ', '１２', '1.2']) {
    assert.equal(hasCharacters(value, '0123456789', 1, 4), false, JSON.stringify(value));
  }
});

test('package validation keeps segment and ASCII rules without RegExp', () => {
  for (const value of ['cn.hita', 'cn.hita_watch.app2', 'Com.Hita_A.X9']) {
    assert.equal(validPackageName(value), true, value);
  }
  for (const value of [null, 1, '', 'hita', '.cn.hita', 'cn.hita.', 'cn..hita',
    'cn.1hita', 'cn._hita', 'cn.hit-a', 'cn.hita\n', 'cn.hita ', 'cn.手表']) {
    assert.equal(validPackageName(value), false, JSON.stringify(value));
  }
});

test('phone identity bounds and whitespace normalization remain strict', () => {
  const peer = { platform: 'harmonyos', packageName: 'cn.hita' };
  for (const fingerprint of ['1', '0'.repeat(31) + '1', '9'.repeat(32)]) {
    assert.equal(isPeerConfigured({ ...peer, fingerprint }), true);
  }
  for (const fingerprint of ['0', '0'.repeat(32), '1'.repeat(33), '1\n', '１', '1.2']) {
    assert.equal(isPeerConfigured({ ...peer, fingerprint }), false, fingerprint);
  }
  assert.equal(normalizePeer('android', 'cn.hita',
    (' \t:a\u00a0b\n').repeat(32)).fingerprint, 'AB'.repeat(32));
  assert.throws(() => normalizePeer('android', 'cn.hita', 'AB'.repeat(31) + 'AZ'));
});

test('date validation rejects extra whitespace, wrong separators and invalid calendar dates', () => {
  assert.ok(Number.isFinite(dayTime('2028-02-29')));
  for (const value of [null, 20261006, '', '2026-2-06', '2026/10/06', '2026-10-06\n',
    '2026-10-06 ', '２０２６-10-06', '2026-02-29', '2026-13-01', '2026-10-00']) {
    assert.ok(Number.isNaN(dayTime(value)), JSON.stringify(value));
  }
});

test('receiver retains exact transfer ID and lowercase checksum validation', () => {
  const raw = '{}';
  function begin(id, crc) {
    const sent = [];
    const receiver = createReceiver({
      send: text => sent.push(JSON.parse(text)), state() {},
      persist() { assert.fail('Begin must not persist'); }, complete() {}
    });
    receiver.receive(JSON.stringify({ ...packet('begin', id),
      total: 1, bytes: utf8Bytes(raw), crc }), Date.now());
    return sent;
  }
  for (const id of ['a', 'A_0-z', 'a'.repeat(64)]) assert.equal(begin(id, checksum(raw))[0].t, 'ack');
  for (const id of ['', 'a'.repeat(65), 'a\n', 'a b', 'a.b', '中文', 1, null]) {
    assert.deepEqual(begin(id, checksum(raw)), []);
  }
  for (const crc of ['ABCDEF12', '1234567', '123456789', '1234567\n', '1234567z', null]) {
    assert.equal(begin('valid', crc)[0].error, 'SIZE');
  }
});

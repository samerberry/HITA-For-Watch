import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { configure } from '../scripts/configure-pairing.cjs';
import {
  isPeerConfigured, normalizePeer, peerPlatform
} from '../entry/src/main/js/MainAbility/common/peer-identity.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const androidSha = 'AB'.repeat(32);
const harmonyAppId = '123456789012345'; // Synthetic identity, never written to the real watch project.
const files = ['pairing-profiles.json', 'entry/src/main/config.json',
  'entry/src/main/js/MainAbility/common/pairing.js'];

function workspace(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hita-pairing-test-'));
  for (const file of files) {
    fs.mkdirSync(path.dirname(path.join(directory, file)), { recursive: true });
    fs.copyFileSync(path.join(root, file), path.join(directory, file));
  }
  t.after(() => {
    assert.equal(path.dirname(directory), fs.realpathSync(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith('hita-pairing-test-'));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  return {
    directory,
    contents: () => files.map(file => fs.readFileSync(path.join(directory, file), 'utf8')),
    read: file => JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8')),
    pairing: () => {
      const text = fs.readFileSync(path.join(directory, files[2]), 'utf8');
      return JSON.parse(text.slice(text.indexOf('export default ') + 15).trim().replace(/;$/, ''));
    }
  };
}

test('HarmonyOS APP IDs and Android SHA-256 identities have separate validation', () => {
  assert.equal(isPeerConfigured(normalizePeer('harmonyos', 'cn.example.hita', harmonyAppId)), true);
  assert.equal(isPeerConfigured(normalizePeer('android', 'cn.example.hita', androidSha)), true);
  assert.throws(() => normalizePeer('harmonyos', 'cn.example.hita', androidSha), /PEER_IDENTITY/);
  assert.throws(() => normalizePeer('android', 'cn.example.hita', harmonyAppId), /PEER_IDENTITY/);
  assert.equal(peerPlatform({ packageName: 'cn.example.hita', fingerprint: androidSha }), 'android');
  assert.equal(isPeerConfigured({ packageName: 'cn.example.hita', fingerprint: androidSha }), true);
});

test('Android formatting is normalized without rewriting the HarmonyOS APP ID', () => {
  assert.equal(normalizePeer('android', 'cn.example.hita', 'ab:'.repeat(31) + 'ab').fingerprint, androidSha);
  assert.equal(normalizePeer('harmonyos', 'cn.example.hita', '  ' + harmonyAppId + '  ').fingerprint, harmonyAppId);
  assert.throws(() => normalizePeer('harmonyos', 'cn.example.hita', '123:456'), /PEER_IDENTITY/);
});

test('empty, placeholder, malformed and unknown-platform peer identities fail closed', () => {
  for (const peer of [
    null, {}, { platform: 'harmonyos', packageName: '', fingerprint: '' },
    { platform: 'harmonyos', packageName: 'cn.example.hita', fingerprint: 'YOUR_APP_ID' },
    { platform: 'harmonyos', packageName: 'cn.example.hita', fingerprint: '000000' },
    { platform: 'harmonyos', packageName: 'cn.example.hita', fingerprint: Number(harmonyAppId) },
    { platform: 'android', packageName: 'cn.example.hita', fingerprint: '0'.repeat(64) },
    { platform: 'ios', packageName: 'cn.example.hita', fingerprint: androidSha },
    { platform: 'harmonyos', packageName: 'cn.example..hita', fingerprint: harmonyAppId },
    { platform: 'harmonyos', packageName: 'cn.example.hita:extra', fingerprint: harmonyAppId }
  ]) assert.equal(isPeerConfigured(peer), false, JSON.stringify(peer));
});

test('configuring HarmonyOS writes APP ID to both the native allowlist and JS peer', async t => {
  const s = workspace(t);
  const result = await configure(s.directory, ['--platform', 'harmonyos', 'cn.example.next', harmonyAppId]);
  assert.deepEqual(result, { platform: 'harmonyos', configured: true });
  assert.deepEqual(s.pairing(), { platform: 'harmonyos', packageName: 'cn.example.next', fingerprint: harmonyAppId });
  assert.deepEqual(s.read(files[1]).module.metaData.customizeData.filter(x => x.name === 'supportLists'),
    [{ name: 'supportLists', value: 'cn.example.next:' + harmonyAppId, extra: '' }]);
});

test('legacy Android arguments and profile selection preserve both identities', async t => {
  const s = workspace(t);
  await configure(s.directory, ['cn.example.android', androidSha]);
  await configure(s.directory, ['--platform', 'harmonyos', 'cn.example.next', harmonyAppId]);
  await configure(s.directory, ['--select', 'android']);
  assert.equal(s.pairing().fingerprint, androidSha);
  assert.equal(s.read(files[0]).harmonyos.fingerprint, harmonyAppId);
  assert.equal(s.read(files[1]).module.metaData.customizeData.find(x => x.name === 'supportLists').value,
    'cn.example.android:' + androidSha);
  await configure(s.directory, ['--select', 'harmonyos']);
  assert.equal(s.pairing().fingerprint, harmonyAppId);
  assert.equal(s.read(files[0]).android.fingerprint, androidSha);
});

test('selecting an empty profile removes the previous native identity without inventing credentials', async t => {
  const s = workspace(t);
  const profiles = s.read(files[0]);
  profiles.harmonyos = { packageName: '', fingerprint: '' };
  fs.writeFileSync(path.join(s.directory, files[0]), JSON.stringify(profiles));
  await configure(s.directory, ['--platform', 'android', 'cn.example.android', androidSha]);
  assert.deepEqual(await configure(s.directory, ['--select', 'harmonyos']), { platform: 'harmonyos', configured: false });
  assert.deepEqual(s.read(files[1]).module.metaData.customizeData.filter(x => x.name === 'supportLists'), []);
  assert.equal(isPeerConfigured(s.pairing()), false);
  assert.equal(s.read(files[0]).android.fingerprint, androidSha);
});

test('invalid command arguments leave all configuration files unchanged', async t => {
  const s = workspace(t);
  const before = s.contents();
  for (const args of [
    [], ['--select', 'ios'], ['--select', 'android', 'extra'],
    ['--platform', 'harmonyos', 'cn.example.hita', androidSha],
    ['--platform', 'android', 'cn.example.hita', harmonyAppId],
    ['--platform', 'harmonyos', 'bad:bundle', harmonyAppId],
    ['--platform', 'harmonyos', 'cn.example.hita', '0000']
  ]) {
    await assert.rejects(configure(s.directory, args));
    assert.deepEqual(s.contents(), before);
  }
});

test('configuration preserves unrelated native metadata', async t => {
  const s = workspace(t);
  const config = s.read(files[1]);
  config.module.metaData = { customizeData: [{ name: 'other', value: 'keep', extra: '' }] };
  fs.writeFileSync(path.join(s.directory, files[1]), JSON.stringify(config));
  await configure(s.directory, ['--platform', 'harmonyos', 'cn.example.next', harmonyAppId]);
  assert.deepEqual(s.read(files[1]).module.metaData.customizeData[0], { name: 'other', value: 'keep', extra: '' });
});

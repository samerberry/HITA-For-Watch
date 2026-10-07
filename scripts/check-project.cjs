const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
assert.notEqual(JSON.parse(read('package.json')).type, 'module',
  'Root type:module breaks the Huawei Lite compiler CommonJS bundling.');
const config = JSON.parse(read('entry/src/main/config.json'));
assert.deepEqual(config.module.deviceType, ['liteWearable']);
assert.equal(config.app.apiVersion.target, 23);
assert.equal(config.app.apiVersion.compatible, 23);
const src = path.join(root, 'entry/src/main');
function walk(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap(x =>
  x.isDirectory() ? walk(path.join(dir, x.name)) : [path.join(dir, x.name)]); }
const files = walk(src);
assert.ok(!files.some(file => /fixture|preview|test|\.p12$|\.p7b$/i.test(file)));
assert.ok(!read('entry/src/main/js/MainAbility/pages/index/index.hml').includes('class="{{'));
assert.ok(!/style="\s*{{/.test(read('entry/src/main/js/MainAbility/pages/index/index.hml')),
  'Lite HML silently discards whole-style bindings; bind each property explicitly.');
assert.ok(!read('entry/src/main/js/MainAbility/vendor/wearengine.js').includes('console.info("receive message:"'));
assert.ok(!files.filter(file => file.endsWith('.js')).some(file =>
  fs.readFileSync(file, 'utf8').includes('@hms.health.WearEngineLite')));
Promise.all(['pairing.js', 'peer-identity.js'].map(name => import(require('node:url').pathToFileURL(
  path.join(src, 'js/MainAbility/common', name)).href))).then(([{ default: pairing }, { isPeerConfigured, validPackageName }]) => {
  const profiles = JSON.parse(read('pairing-profiles.json'));
  assert.ok(['android', 'harmonyos'].includes(profiles.activePlatform));
  for (const platform of ['android', 'harmonyos']) {
    const profile = profiles[platform];
    assert.ok(profile && (isPeerConfigured({ ...profile, platform }) ||
      (profile.fingerprint === '' && (profile.packageName === '' || validPackageName(profile.packageName)))),
    'Invalid saved peer profile: ' + platform);
  }
  assert.deepEqual(pairing, { platform: profiles.activePlatform, ...profiles[profiles.activePlatform] });
  const supports = (config.module.metaData?.customizeData || []).filter(x => x.name === 'supportLists');
  if (isPeerConfigured(pairing)) {
    assert.equal(supports.length, 1);
    assert.equal(supports[0].value, `${pairing.packageName}:${pairing.fingerprint}`);
  } else {
    assert.equal(pairing.fingerprint, '', 'Invalid identity must not be treated as an unconfigured peer.');
    assert.equal(supports.length, 0, 'Unconfigured builds must not retain a stale allowlist.');
    console.log(`Hardware setup pending: ${pairing.platform} phone identity has not been configured.`);
  }
  console.log('PASS: API 23 target, isolated production resources, matching peer configuration and licenses.');
}).catch(error => { console.error(error); process.exitCode = 1; });
assert.ok(fs.statSync(path.join(src, 'resources/base/media/app_icon.png')).size > 0);
for (const name of ['third_party/Huawei-WearEngine-LICENSE.txt', 'third_party/Lucide-LICENSE.txt']) {
  assert.ok(fs.statSync(path.join(root, name)).size > 0);
}

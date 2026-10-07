const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const sdk = path.resolve(process.env.DEVECO_SDK_HOME || 'C:/Program Files/Huawei/DevEco Studio/sdk', 'default');
const bundle = path.join(root, 'entry/build/default/intermediates/loader_out_lite/default/js/MainAbility');

function checkBundle(directory = bundle) {
  const jerry = path.join(sdk, 'openharmony/js/build-tools/ace-loader/bin',
    process.platform === 'win32' ? 'jerry.exe' : 'jerry');
  assert.ok(fs.existsSync(jerry), 'Install the Lite JS SDK or set DEVECO_SDK_HOME.');
  assert.ok(fs.existsSync(path.join(directory, 'manifest.json')), 'Build entry with assembleHap first.');
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
  assert.ok(Array.isArray(manifest.pages) && manifest.pages.length, 'Missing Lite manifest pages.');
  const files = ['app.js', ...manifest.pages.map(page => page + '.js')];
  for (const file of files) {
    const absolute = path.join(directory, file);
    const source = fs.readFileSync(absolute, 'utf8');
    const parsed = spawnSync(jerry, ['--parse-only', absolute],
      { encoding: 'utf8', windowsHide: true, timeout: 10000 });
    assert.equal(parsed.status, 0, file + ': ' + (parsed.error?.message || '') + parsed.stdout + parsed.stderr);
    // Syntax checks alone cannot catch webpack leaving CommonJS imports unresolved.
    const page = vm.runInNewContext(source, {
      console, setTimeout, clearTimeout, setInterval, clearInterval,
      requireNative(name) {
        assert.ok(['system.storage', 'system.wearengine', 'system.device'].includes(name), 'Unexpected native module: ' + name);
        return {};
      },
      ViewModel: function(options) { this.options = options; }
    }, { filename: absolute, timeout: 5000 });
    assert.ok(page && page.options, file + ' did not create a ViewModel.');
    const size = Buffer.byteLength(source);
    console.log('PASS: Lite syntax and bundled imports: ' + file + ' (' + size + ' bytes)');
    if (size > 48 * 1024) {
      console.warn('NOTE: debug JS exceeds 48 KiB; the simulator allows this. Use a release build for device packaging.');
    }
  }
  return { directory, manifest };
}

module.exports = { checkBundle, sdk, bundle };
if (require.main === module) {
  try { checkBundle(process.argv[2] ? path.resolve(process.argv[2]) : bundle); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}

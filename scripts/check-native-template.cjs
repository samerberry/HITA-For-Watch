const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
process.env.DEVICE_LEVEL = 'lite';
process.env.DEVICE_TYPE = 'liteWearable';
process.env.PLATFORM_VERSION = 'Version6';
const sdk = process.env.DEVECO_SDK_HOME || 'C:/Program Files/Huawei/DevEco Studio/sdk';
const base = path.join(sdk, 'default/openharmony/js/build-tools/ace-loader/lib');
const { parseTemplate } = require(path.join(base, 'parser'));
const { transformTemplate } = require(path.join(base, 'lite/lite-transform-template'));
const file = path.resolve(__dirname, '../entry/src/main/js/MainAbility/pages/index/index.hml');
(async () => {
  const result = await parseTemplate(fs.readFileSync(file, 'utf8'), file);
  assert.ok(!(result.log || []).some(log => /ERROR|WARNING/.test(log.reason)), JSON.stringify(result.log));
  const ast = Function('return (' + result.parsed + ')')();
  const nodes = [];
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    nodes.push(node);
    (node.children || []).forEach(visit);
  }
  visit(ast);
  for (const [css, key] of [
    ['day', 'backgroundColor'], ['day-name', 'color'], ['day-number', 'color'],
    ['day-dot', 'backgroundColor'], ['course', 'backgroundColor'],
    ['course-title', 'height'], ['course-room', 'height'], ['course-teacher', 'height'],
    ['screen', 'width'], ['screen', 'height'], ['day', 'width'],
    ['course-list', 'height'], ['sync-list', 'height'], ['course-title', 'width'],
    ['course-row', 'height'], ['course', 'height'], ['sync-row', 'height'], ['sync-content', 'height'],
    ['saved-title', 'height'], ['saved-range', 'height']
  ]) {
    const node = nodes.find(node => Array.isArray(node.classList) && node.classList.includes(css));
    assert.equal(typeof node?.style?.[key], 'function', css + ' must retain its native dynamic style');
  }
  const generated = transformTemplate(result.parsed);
  assert.ok(generated.includes('dynamicStyle'));
  console.log('PASS: Huawei Lite HML parser retains adaptive dimensions, date colors and explicit native row heights.');
})().catch(error => { console.error(error.message); process.exitCode = 1; });

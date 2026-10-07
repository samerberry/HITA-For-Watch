import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';

let sent;
globalThis.__hitaPageDevice = {
  getInfo({ success }) { success({ screenShape: 'circle', windowWidth: 466, windowHeight: 466 }); }
};
globalThis.__hitaPagePeer = { platform: 'harmonyos', packageName: 'cn.example.next', fingerprint: '' };
globalThis.__hitaPageStorage = {
  get({ success }) { success(''); },
  set({ success }) { success(); }
};
globalThis.__hitaPageNative = {
  getWearEngineVersion(options) { options.complete('5.0.0.401'); },
  setPackageName(options) { options.complete(); },
  setFingerprint(options) { options.complete(); },
  subscribeMsg(options) { options.success({ isRegister: true }); },
  unsubscribeMsg() {},
  sendMsg(options) { sent.push(options); }
};
const modules = {
  '@system.device': 'Device',
  '@system.storage': 'Storage',
  '@system.wearengine': 'Native'
};
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    const name = modules[specifier] || (specifier === '../../common/pairing.js' ? 'Peer' : '');
    if (name) return { url: 'test:hita-page-' + name, shortCircuit: true };
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith('test:hita-page-')) return {
      format: 'module', source: 'export default globalThis.__hitaPage' + url.slice('test:hita-page-'.length) + ';',
      shortCircuit: true
    };
    return nextLoad(url, context);
  }
});
const { default: controller } = await import('../entry/src/main/js/MainAbility/pages/index/index.js');
hooks.deregister();

function setup(t, configured = true) {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  globalThis.__hitaPagePeer.fingerprint = configured ? '123456789012345' : '';
  sent = [];
  const page = { ...controller, ...structuredClone(controller.data) };
  t.after(() => page.onDestroy());
  page.onInit();
  page.onShow();
  return page;
}

test('unconfigured HarmonyOS watch shows pending integration and cannot request a snapshot', t => {
  const page = setup(t, false);
  assert.equal(page.syncState, '鸿蒙手机待接入');
  assert.equal(page.syncDetail, '同步身份尚未配置');
  page.requestSync();
  assert.equal(page.syncDetail, '请先完成手机端接入配置');
  assert.equal(page.syncBusy, false);
  assert.equal(sent.length, 0);
});

test('device info selects a rectangular layout without changing the app identity or selected date', t => {
  t.mock.method(globalThis.__hitaPageDevice, 'getInfo', ({ success }) => {
    success({ screenShape: 'rect', windowWidth: 408, windowHeight: 480 });
  });
  const page = setup(t, false);
  assert.equal(page.layout.shape, 'rect');
  assert.equal(page.layout.width, 408);
  assert.equal(page.layout.height, 480);
  assert.equal(page.selectedIsToday, true);
  assert.equal(page.syncState, '鸿蒙手机待接入');
});

test('failed and late device queries preserve a safe layout and do not change a destroyed page', t => {
  let complete;
  t.mock.method(globalThis.__hitaPageDevice, 'getInfo', options => {
    complete = options.success;
    options.fail();
  });
  const page = setup(t);
  const fallback = page.layout;
  assert.equal(fallback.shape, 'circle');
  page.onDestroy();
  complete({ screenShape: 'rect', windowWidth: 408, windowHeight: 480 });
  assert.equal(page.layout, fallback);
});

test('date selection and timer refresh keep the native weekday click targets stable', t => {
  const page = setup(t);
  const days = page.days;
  const items = days.slice();
  page.selectDate(days[0].key);
  page.selectDate(days[6].key);
  assert.equal(page.days, days);
  for (let i = 0; i < items.length; i++) assert.equal(page.days[i], items[i]);
  t.mock.timers.tick(15000);
  assert.equal(page.days, days);
  page.goToday();
  assert.equal(page.days, days);
  assert.equal(page.selectedIsToday, true);
});

test('weekday tap, horizontal swipe and sync return continue working across repeated navigation', t => {
  const page = setup(t);
  const days = page.days;
  for (let round = 0; round < 3; round++) {
    page.selectDate(days[0].key);
    const mondayHeading = page.heading;
    page.swipeDay({ direction: 'left' });
    assert.notEqual(page.heading, mondayHeading);
    page.swipeDay({ direction: 'right' });
    assert.equal(page.heading, mondayHeading);
    page.openSync();
    assert.equal(page.showSync, true);
    page.swipeDay({ direction: 'right' });
    assert.equal(page.showSync, false);
    assert.equal(page.days, days);
  }
});

test('registered HarmonyOS peer with no phone response times out without reporting success', t => {
  const page = setup(t);
  assert.equal(page.syncState, '等待鸿蒙手机');
  page.requestSync();
  assert.equal(page.syncBusy, true);
  assert.equal(page.syncDetail, '等待鸿蒙手机回应');
  assert.equal(JSON.parse(sent[0].message).t, 'request');
  // Native send success is not an application-level snapshot acknowledgement.
  sent[0].success();
  assert.equal(page.syncState, '正在请求课表');
  t.mock.timers.tick(15000);
  assert.equal(page.syncState, '手机未回应');
  assert.equal(page.syncBusy, false);
});

test('leaving the foreground cancels the pending request and ignores its callbacks', t => {
  const page = setup(t);
  page.requestSync();
  page.onHide();
  const state = page.syncState;
  sent[0].fail('late failure', 206);
  t.mock.timers.tick(30000);
  assert.equal(page.syncState, state);
  assert.equal(page.syncBusy, false);
});

test('late request send failures cannot overwrite incoming transfer or saved state', t => {
  const page = setup(t);
  page.requestSync();
  page.syncProgress('receiving', '50');
  sent[0].fail('late failure', 206);
  assert.equal(page.syncState, '正在接收 50%');
  assert.equal(page.syncBusy, true);
  page.syncProgress('ready', '');
  t.mock.timers.tick(30000);
  assert.equal(page.syncState, '同步完成');
  assert.equal(page.syncBusy, false);
});

test('a late failure from a timed-out request cannot interrupt a new request', t => {
  const page = setup(t);
  page.requestSync();
  t.mock.timers.tick(15000);
  page.requestSync();
  sent[0].fail('old request failure', 206);
  assert.equal(page.syncState, '正在请求课表');
  assert.equal(page.syncBusy, true);
  sent[1].fail('current request failure', 206);
  assert.equal(page.syncState, '暂未连接手机');
  assert.equal(page.syncBusy, false);
});

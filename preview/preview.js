import { fixture, NOW } from '/tests/fixtures.mjs';
import { viewData } from '/entry/src/main/js/MainAbility/common/view-model.js';
import { dayKey, checksum, splitUtf8, utf8Bytes, parseSnapshot } from '/entry/src/main/js/MainAbility/common/schedule.js';
import { createReceiver, packet } from '/entry/src/main/js/MainAbility/common/sync-protocol.js';
import { createSnapshotStore } from '/entry/src/main/js/MainAbility/common/snapshot-store.js';
import pairing from '/entry/src/main/js/MainAbility/common/pairing.js';
import { peerPlatform } from '/entry/src/main/js/MainAbility/common/peer-identity.js';
import { displayLayout } from '/entry/src/main/js/MainAbility/common/display-layout.js';
import { previewDevices } from './devices.mjs';

const template = new DOMParser().parseFromString(
  await (await fetch('/entry/src/main/js/MainAbility/pages/index/index.hml')).text(), 'application/xml').documentElement;
const watch = document.querySelector('#watch');
const result = document.querySelector('#result');
const deviceSelect = document.querySelector('#device-select');
const selectedDevice = new URLSearchParams(location.search).get('device');
let profile = previewDevices.find(item => item.id === selectedDevice) || previewDevices[0];
let layout = displayLayout(profile);
for (const item of previewDevices) {
  const option = document.createElement('option');
  option.value = item.id;
  option.textContent = item.name;
  deviceSelect.append(option);
}
deviceSelect.value = profile.id;
function sizeDevice() {
  const area = document.querySelector('.device-area');
  const shell = document.querySelector('.device-shell');
  const scale = Math.min(1, (area.clientWidth - 16) / (layout.width + 28));
  Object.assign(shell.style, {
    width: layout.width + 28 + 'px', height: layout.height + 28 + 'px',
    borderRadius: layout.shape === 'circle' ? '50%' : '44px',
    transform: 'scale(' + scale + ')'
  });
  Object.assign(watch.style, {
    width: layout.width + 'px', height: layout.height + 'px',
    borderRadius: layout.shape === 'circle' ? '50%' : '32px'
  });
  area.style.height = (layout.height + 28) * scale + 32 + 'px';
  watch.setAttribute('aria-label', profile.name + ' ' + layout.width + 'x' + layout.height);
  document.querySelector('#device-label').textContent = profile.name;
}
deviceSelect.onchange = () => {
  profile = previewDevices.find(item => item.id === deviceSelect.value);
  layout = displayLayout(profile);
  sizeDevice();
  render(true);
};
new ResizeObserver(sizeDevice).observe(document.querySelector('.device-area'));
sizeDevice();
const storage = {
  get({ key, default: fallback, success, fail }) {
    try { queueMicrotask(() => success(localStorage.getItem('preview_' + key) || fallback)); } catch (e) { fail(e); }
  },
  set({ key, value, success, fail }) {
    try { localStorage.setItem('preview_' + key, value); queueMicrotask(success); } catch (e) { fail(e); }
  }
};
let store = createSnapshotStore(storage);
let snapshot = await new Promise(resolve => store.load((error, data) => resolve(data)));
if (snapshot) result.textContent = '已读取预览缓存 · 可离线查看';
let selected = dayKey(NOW);
let showSync = false;
let syncBusy = false;
let syncState = '等待' + (peerPlatform(pairing) === 'harmonyos' ? '鸿蒙手机' : '安卓手机');
let syncDetail = '同步服务已就绪';
let pendingReply;
let interrupt = false;
const receiver = createReceiver({
  send: text => { if (pendingReply) pendingReply(JSON.parse(text)); },
  persist: (data, done) => store.save(data, done),
  complete: saved => { snapshot = saved; render(); },
  state: (state, detail) => {
    syncBusy = ['receiving', 'saving'].includes(state);
    syncState = state === 'receiving' ? `正在接收 ${detail}%` : state === 'ready' ? '同步完成' :
      state === 'saving' ? '正在保存' : '同步未完成';
    syncDetail = state === 'ready' ? '课表已保存在手表' : state === 'error' ? '原课表未改动，请重新同步' : '请保持连接';
    render();
  }
});
const actions = {
  selectDate(key) { selected = key; render(true); },
  goToday() { selected = dayKey(NOW); showSync = false; render(true); },
  openSync() { showSync = true; render(true); },
  closeSync() { showSync = false; render(true); },
  requestSync() { if (!syncBusy) simulate(fixture()); }
};
// The expression source is the repository's trusted HML, never imported JSON.
const evaluate = (source, scope) => Function('s', `with(s){ return (${source}); }`)(scope);
const substitute = (text, scope) => text.replace(/{{(.*?)}}/g, (_, expr) => evaluate(expr, scope) ?? '');
function element(node, scope, repeated = false) {
  if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(substitute(node.nodeValue, scope));
  if (node.nodeType !== Node.ELEMENT_NODE) return document.createTextNode('');
  if (node.hasAttribute('for') && !repeated) {
    const fragment = document.createDocumentFragment();
    const items = evaluate(node.getAttribute('for').slice(2, -2), scope);
    items.forEach($item => fragment.append(element(node, { ...scope, $item }, true)));
    return fragment;
  }
  if (node.hasAttribute('if') && !evaluate(node.getAttribute('if').slice(2, -2), scope)) return document.createTextNode('');
  const tag = { text: 'span', image: 'img', list: 'div', 'list-item': 'div' }[node.tagName] || node.tagName;
  const el = document.createElement(tag);
  for (const attr of node.attributes) {
    if (['for', 'if', 'tid', 'onswipe'].includes(attr.name)) continue;
    if (attr.name === 'onclick') {
      el.dataset.action = attr.value;
      el.setAttribute('role', 'button');
      el.tabIndex = 0;
      const invoke = () => evaluate(attr.value.includes('(') ? attr.value : attr.value + '()', { ...scope, ...actions });
      el.addEventListener('click', invoke);
      el.addEventListener('keydown', e => { if (e.key === 'Enter') invoke(); });
    } else {
      let value = substitute(attr.value, scope);
      if (attr.name === 'src') value = '/entry/src/main/js/MainAbility' + value;
      el.setAttribute(attr.name, value);
    }
  }
  if (node.tagName !== 'div') el.classList.add('native-' + node.tagName);
  for (const child of node.childNodes) el.append(element(child, scope));
  return el;
}
function render(reset = false) {
  const top = reset ? 0 : (watch.querySelector('.course-list')?.scrollTop || 0);
  watch.replaceChildren(element(template, {
    ...viewData(snapshot, selected, NOW, layout), layout, showSync, syncBusy, syncState, syncDetail
  }));
  const list = watch.querySelector('.course-list');
  if (list) list.scrollTop = top;
}
async function exchange(p) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { pendingReply = null; reject(Error('TIMEOUT')); }, 3000);
    pendingReply = reply => { clearTimeout(timeout); pendingReply = null; resolve(reply); };
    receiver.receive(JSON.stringify(p), NOW);
  });
}
async function simulate(data) {
  if (syncBusy) return;
  document.querySelector('#demo').disabled = true;
  try {
    const raw = JSON.stringify(parseSnapshot(JSON.stringify(data)));
    const parts = splitUtf8(raw, 384);
    const id = 'preview_' + Date.now();
    await exchange({ ...packet('begin', id), bytes: utf8Bytes(raw), total: parts.length, crc: checksum(raw) });
    for (let n = 0; n < parts.length; n++) {
      if (interrupt && n === 2) {
        interrupt = false;
        receiver.tick(NOW + 100000);
        throw Error('INTERRUPTED');
      }
      await new Promise(resolve => setTimeout(resolve, 35));
      const reply = await exchange({ ...packet('chunk', id), n, data: parts[n] });
      if (reply.t !== 'ack') throw Error(reply.error || reply.t);
    }
    const reply = await exchange(packet('end', id));
    if (reply.t !== 'done') throw Error(reply.error || reply.t);
    result.textContent = '同步完成 · 已通过分片、校验和与持久化确认';
  } catch (e) {
    syncBusy = false;
    result.textContent = '未替换课表 · ' + e.message;
  } finally { document.querySelector('#demo').disabled = false; render(); }
}
document.querySelector('#demo').onclick = () => simulate(fixture());
document.querySelector('#interrupt').onclick = () => { interrupt = true; result.textContent = '下一次传输将在途中断开，旧课表应保留'; };
document.querySelector('#empty').onclick = async () => {
  if (syncBusy) return;
  Object.keys(localStorage).filter(key => key.startsWith('preview_hita_')).forEach(key => localStorage.removeItem(key));
  store = createSnapshotStore(storage);
  await new Promise(resolve => store.load(resolve));
  snapshot = null;
  showSync = false;
  selected = dayKey(NOW);
  result.textContent = '已清空预览缓存';
  render(true);
};
document.querySelector('#snapshot-file').onchange = async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    if (file.size > 65536) throw Error('文件超过64KB');
    await simulate(JSON.parse(await file.text()));
  } catch (error) { result.textContent = error.message; }
};
let touchStart = null;
watch.addEventListener('pointerdown', e => { touchStart = [e.clientX, e.clientY]; });
watch.addEventListener('pointerup', e => {
  if (!touchStart) return;
  const dx = e.clientX - touchStart[0], dy = e.clientY - touchStart[1];
  touchStart = null;
  if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
  if (showSync) { if (dx > 0) actions.closeSync(); return; }
  const days = viewData(snapshot, selected, NOW).days;
  const next = days.findIndex(x => x.key === selected) + (dx < 0 ? 1 : -1);
  if (days[next]) actions.selectDate(days[next].key);
});
render();

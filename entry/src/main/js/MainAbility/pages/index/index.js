import storage from '@system.storage';
import device from '@system.device';
import { displayLayout } from '../../common/display-layout.js';
import pairing from '../../common/pairing.js';
import { peerPlatform } from '../../common/peer-identity.js';
import { createSnapshotStore } from '../../common/snapshot-store.js';
import { createReceiver, packet } from '../../common/sync-protocol.js';
import { createWearTransport } from '../../common/wear-transport.js';
import { dayKey, weekStart } from '../../common/schedule.js';
import { viewData } from '../../common/view-model.js';

let snapshot = null;
let selected = '';
let store = null;
let receiver = null;
let transport = null;
let timer = null;
let requestTimer = null;
let requestGeneration = 0;
let visible = false;
let lastWeek = 0;
let storeReady = false;
let deviceGeneration = 0;
const phoneName = peerPlatform(pairing) === 'harmonyos' ? '鸿蒙手机' : '安卓手机';

export default {
  data: {
    layout: displayLayout(),
    days: [], events: [], heading: '', weekLabel: '', subtitle: '',
    emptyTitle: '正在读取课表', emptyText: '', hasEvents: false, hasSnapshot: false,
    syncText: '未同步', selectedIsToday: true, timetableName: '', campus: '', rangeText: '',
    showSync: false, syncState: '未连接', syncDetail: '等待手机课表', syncBusy: false,
    savedTitleHeight: 26, savedRangeHeight: 24
  },
  onInit() {
    const self = this;
    selected = dayKey(Date.now());
    lastWeek = weekStart(Date.now());
    storeReady = false;
    store = createSnapshotStore(storage);
    receiver = createReceiver({
      send: function(text) { if (transport) transport.send(text); },
      state: function(state, detail) { self.syncProgress(state, detail); },
      persist: function(data, done) { store.save(data, done); },
      complete: function(saved) { snapshot = saved; self.refresh(); }
    });
    transport = createWearTransport(pairing,
      function(text) { receiver.receive(text, Date.now()); },
      function(state) { self.connectionState(state); });
    store.load(function(error, saved) {
      if (error) {
        console.error('HITA_STORAGE_READ_FAILED');
        self.syncState = '无法读取课表';
        self.syncDetail = '请重新打开应用，原课表未改动';
        return;
      }
      snapshot = saved;
      storeReady = true;
      self.refresh();
      console.info('HITA_CACHE_READY ' + (saved ? saved.events.length : 0));
      if (visible) transport.start();
    });
    this.refresh();
    const generation = ++deviceGeneration;
    try {
      device.getInfo({
        success: function(info) {
          if (generation !== deviceGeneration) return;
          self.layout = displayLayout(info);
          self.refresh();
          console.info('HITA_DISPLAY ' + self.layout.width + 'x' + self.layout.height + ' ' + self.layout.shape);
        },
        fail: function() { console.warn('HITA_DEVICE_INFO_UNAVAILABLE'); }
      });
    } catch (_) { console.warn('HITA_DEVICE_INFO_UNAVAILABLE'); }
  },
  onShow() {
    visible = true;
    const self = this;
    if (transport && storeReady) transport.start();
    if (timer !== null) clearInterval(timer);
    timer = setInterval(function() {
      if (!visible) return;
      receiver.tick(Date.now());
      self.refresh();
    }, 15000);
    this.refresh();
  },
  onHide() {
    visible = false;
    if (timer !== null) clearInterval(timer);
    if (requestTimer !== null) clearTimeout(requestTimer);
    requestGeneration++;
    timer = null;
    requestTimer = null;
    if (receiver) receiver.cancel();
    if (transport) transport.stop();
    this.syncBusy = false;
  },
  onDestroy() { deviceGeneration++; this.onHide(); },
  refresh() {
    const now = Date.now();
    if (!selected || lastWeek !== weekStart(now)) {
      selected = dayKey(now);
      lastWeek = weekStart(now);
    }
    const view = viewData(snapshot, selected, now, this.layout);
    const sameWeek = this.days.length === view.days.length &&
      this.days.every(function(day, index) { return day.key === view.days[index].key; });
    if (sameWeek) {
      // Keep native click targets alive while their selection handler is running.
      for (let i = 0; i < view.days.length; i++) {
        const keys = Object.keys(view.days[i]);
        for (let j = 0; j < keys.length; j++) {
          const key = keys[j];
          if (this.days[i][key] !== view.days[i][key]) this.days[i][key] = view.days[i][key];
        }
      }
    } else this.days = view.days;
    const sameOrder = this.events.length === view.events.length &&
      this.events.every(function(event, index) { return event.id === view.events[index].id; });
    if (sameOrder) {
      // Updating the clock/status must not rebuild the list and reset its scroll position.
      for (let i = 0; i < view.events.length; i++) {
        const keys = Object.keys(view.events[i]);
        for (let j = 0; j < keys.length; j++) {
          const key = keys[j];
          if (this.events[i][key] !== view.events[i][key]) this.events[i][key] = view.events[i][key];
        }
      }
    } else this.events = view.events;
    this.heading = view.heading;
    this.weekLabel = view.weekLabel;
    this.subtitle = view.subtitle;
    this.emptyTitle = view.emptyTitle;
    this.emptyText = view.emptyText;
    this.hasEvents = view.hasEvents;
    this.hasSnapshot = view.hasSnapshot;
    this.syncText = view.syncText;
    this.selectedIsToday = view.selectedIsToday;
    this.timetableName = view.timetableName;
    this.campus = view.campus;
    this.rangeText = view.rangeText;
    this.savedTitleHeight = view.savedTitleHeight;
    this.savedRangeHeight = view.savedRangeHeight;
  },
  selectDate(key) {
    selected = key;
    this.refresh();
    this.resetScroll();
  },
  resetScroll() {
    try { this.$element('courses').scrollTo({ index: 0 }); } catch (_) {}
  },
  goToday() {
    this.selectDate(dayKey(Date.now()));
    this.showSync = false;
  },
  openSync() { this.showSync = true; },
  closeSync() { this.showSync = false; },
  swipeDay(event) {
    if (this.showSync) {
      if (event.direction === 'right') this.closeSync();
      return;
    }
    if (event.direction !== 'left' && event.direction !== 'right') return;
    let index = 0;
    for (let i = 0; i < this.days.length; i++) if (this.days[i].key === selected) index = i;
    const next = index + (event.direction === 'left' ? 1 : -1);
    if (next >= 0 && next < this.days.length) this.selectDate(this.days[next].key);
  },
  connectionState(state) {
    const labels = {
      unconfigured: [phoneName + '待接入', '同步身份尚未配置'],
      connecting: ['正在连接', '正在启动同步服务'],
      unavailable: ['同步服务不可用', '请检查手表系统与运动健康连接'],
      disconnected: ['暂未连接手机', '已保存的课表仍可查看'],
      waiting: ['等待' + phoneName, '同步服务已就绪']
    };
    const label = labels[state] || labels.disconnected;
    this.syncState = label[0];
    this.syncDetail = label[1];
  },
  syncProgress(state, detail) {
    if (requestTimer !== null) clearTimeout(requestTimer);
    requestTimer = null;
    requestGeneration++;
    this.syncBusy = state === 'receiving' || state === 'saving';
    if (state === 'receiving') {
      this.syncState = '正在接收 ' + detail + '%';
      this.syncDetail = '同步期间请保持应用打开';
    } else if (state === 'saving') {
      this.syncState = '正在保存';
      this.syncDetail = '正在校验课表';
    } else if (state === 'ready') {
      this.syncState = '同步完成';
      this.syncDetail = '课表已保存在手表';
    } else {
      this.syncState = detail === 'STALE' ? '已保留较新课表' : '同步未完成';
      this.syncDetail = '原课表未改动，请重新同步';
    }
  },
  requestSync() {
    if (this.syncBusy) return;
    if (!storeReady) {
      this.syncState = '课表存储未就绪';
      this.syncDetail = '请重新打开应用后同步';
      return;
    }
    if (!transport || !transport.configured()) {
      this.connectionState('unconfigured');
      this.syncDetail = '请先完成手机端接入配置';
      return;
    }
    const self = this;
    const token = ++requestGeneration;
    const request = packet('request', 'watch_' + Date.now());
    this.syncBusy = true;
    this.syncState = '正在请求课表';
    this.syncDetail = '等待' + phoneName + '回应';
    requestTimer = setTimeout(function() {
      requestTimer = null;
      requestGeneration++;
      self.syncBusy = false;
      self.syncState = '手机未回应';
      self.syncDetail = '请打开手机 HITA 的手表同步';
    }, 15000);
    transport.send(JSON.stringify(request), function(error) {
      if (!error || token !== requestGeneration) return;
      clearTimeout(requestTimer);
      requestTimer = null;
      requestGeneration++;
      self.syncBusy = false;
      self.connectionState('disconnected');
    });
  }
};

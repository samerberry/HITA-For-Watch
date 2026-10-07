import { hasCharacters } from './characters.js';

export const DAY_MS = 86400000;
export const CHINA_OFFSET = 28800000;
export const MAX_PAYLOAD_BYTES = 65536;
export const MAX_EVENTS = 240;
export const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];

export function pad(value) {
  return value < 10 ? '0' + value : '' + value;
}

export function dayKey(time) {
  const d = new Date(time + CHINA_OFFSET);
  return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
}

export function dayTime(key) {
  if (typeof key !== 'string' || key.length !== 10 || key.charAt(4) !== '-' || key.charAt(7) !== '-' ||
    !hasCharacters(key.slice(0, 4) + key.slice(5, 7) + key.slice(8), '0123456789', 8, 8)) return NaN;
  const parts = key.split('-');
  const value = Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])) - CHINA_OFFSET;
  return dayKey(value) === key ? value : NaN;
}

export function clockText(time) {
  const d = new Date(time + CHINA_OFFSET);
  return pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes());
}

export function monthDay(key) {
  return key.slice(5, 7) + '/' + key.slice(8, 10);
}

export function weekStart(time) {
  const midnight = dayTime(dayKey(time));
  const weekday = new Date(midnight + CHINA_OFFSET).getUTCDay();
  return midnight - ((weekday + 6) % 7) * DAY_MS;
}

function integer(value) {
  return typeof value === 'number' && isFinite(value) && Math.floor(value) === value;
}

function text(value, max, required) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) {
    throw new Error('INVALID_TEXT');
  }
  return value.trim();
}

export function utf8Bytes(value) {
  let count = 0;
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (c < 0x80) count++;
    else if (c < 0x800) count += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < value.length &&
      value.charCodeAt(i + 1) >= 0xdc00 && value.charCodeAt(i + 1) <= 0xdfff) {
      count += 4;
      i++;
    } else count += 3;
  }
  return count;
}

export function splitUtf8(value, maxBytes) {
  const result = [];
  let part = '';
  let bytes = 0;
  for (let i = 0; i < value.length; i++) {
    let character = value.charAt(i);
    const c = value.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < value.length &&
      value.charCodeAt(i + 1) >= 0xdc00 && value.charCodeAt(i + 1) <= 0xdfff) {
      character += value.charAt(++i);
    }
    const size = utf8Bytes(character);
    if (bytes + size > maxBytes && part) {
      result.push(part);
      part = '';
      bytes = 0;
    }
    part += character;
    bytes += size;
  }
  if (part) result.push(part);
  return result;
}

// CRC32 over UTF-8 bytes is an integrity check, not authentication.
export function checksum(value) {
  let crc = -1;
  function byte(n) {
    crc ^= n;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  for (let i = 0; i < value.length; i++) {
    let c = value.charCodeAt(i);
    if (c < 128) byte(c);
    else if (c < 2048) { byte(192 | (c >> 6)); byte(128 | (c & 63)); }
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < value.length &&
      value.charCodeAt(i + 1) >= 0xdc00 && value.charCodeAt(i + 1) <= 0xdfff) {
      c = 0x10000 + ((c - 0xd800) << 10) + (value.charCodeAt(++i) - 0xdc00);
      byte(240 | (c >> 18)); byte(128 | ((c >> 12) & 63));
      byte(128 | ((c >> 6) & 63)); byte(128 | (c & 63));
    } else {
      byte(224 | (c >> 12)); byte(128 | ((c >> 6) & 63)); byte(128 | (c & 63));
    }
  }
  return ('00000000' + ((crc ^ -1) >>> 0).toString(16)).slice(-8);
}

export function parseSnapshot(raw) {
  if (typeof raw !== 'string' || utf8Bytes(raw) > MAX_PAYLOAD_BYTES) throw new Error('TOO_LARGE');
  const data = JSON.parse(raw);
  if (!data || data.version !== 1 || data.timezone !== 'Asia/Shanghai') throw new Error('VERSION');
  if (!integer(data.generatedAt) || data.generatedAt <= 0) throw new Error('REVISION');
  const start = dayTime(data.rangeStart);
  const end = dayTime(data.rangeEnd);
  if (!isFinite(start) || !isFinite(end) || end < start || end - start > 34 * DAY_MS) {
    throw new Error('DATE_RANGE');
  }
  const timetable = data.timetable;
  if (!timetable || !isFinite(dayTime(timetable.termStart))) throw new Error('TERM_START');
  if (weekStart(dayTime(timetable.termStart)) !== dayTime(timetable.termStart)) {
    throw new Error('TERM_START_MONDAY');
  }
  if (!Array.isArray(data.events) || data.events.length > MAX_EVENTS) throw new Error('EVENTS');
  const ids = [];
  const events = [];
  for (let i = 0; i < data.events.length; i++) {
    const e = data.events[i];
    if (!e || !integer(e.startAt) || !integer(e.endAt) || e.endAt <= e.startAt ||
      e.endAt - e.startAt > 2 * DAY_MS || e.startAt < start || e.endAt > end + DAY_MS) {
      throw new Error('EVENT_TIME');
    }
    const id = text(e.id, 100, true);
    if (ids.indexOf(id) >= 0) throw new Error('DUPLICATE_EVENT');
    if (['CLASS', 'EXAM', 'OTHER'].indexOf(e.kind) < 0) throw new Error('EVENT_KIND');
    ids.push(id);
    events.push({
      id: id,
      title: text(e.title, 100, true),
      room: text(e.room || '', 120, false),
      teacher: text(e.teacher || '', 120, false),
      sections: text(e.sections || '', 30, false),
      kind: e.kind,
      startAt: e.startAt,
      endAt: e.endAt
    });
  }
  events.sort(function(a, b) { return a.startAt - b.startAt || a.endAt - b.endAt; });
  // Only these fields are persisted; phone credentials and unknown fields are discarded.
  return {
    version: 1,
    timezone: 'Asia/Shanghai',
    generatedAt: data.generatedAt,
    rangeStart: data.rangeStart,
    rangeEnd: data.rangeEnd,
    timetable: {
      id: text(timetable.id, 100, true),
      name: text(timetable.name, 80, true),
      campus: text(timetable.campus || '', 20, false),
      termStart: timetable.termStart
    },
    events: events
  };
}

export function weekDays(now, selected, snapshot) {
  const monday = weekStart(now);
  const today = dayKey(now);
  const days = [];
  for (let i = 0; i < 7; i++) {
    const time = monday + i * DAY_MS;
    const key = dayKey(time);
    let hasCourses = false;
    if (snapshot) {
      hasCourses = snapshot.events.some(function(e) {
        return e.startAt < time + DAY_MS && e.endAt > time;
      });
    }
    days.push({
      key: key, weekday: WEEKDAYS[i], number: '' + new Date(time + CHINA_OFFSET).getUTCDate(),
      selected: key === selected, today: key === today, hasCourses: hasCourses,
      backgroundColor: key === selected ? '#B6D5FF' : (key === today ? '#20334D' : '#14171B'),
      nameColor: key === selected ? '#213B5B' : '#AEB8C5',
      numberColor: key === selected ? '#10233C' : '#FFFFFF',
      dotColor: hasCourses ? (key === selected ? '#245590' : '#8DB9F1') :
        (key === selected ? '#B6D5FF' : (key === today ? '#20334D' : '#14171B'))
    });
  }
  return days;
}

export function selectedDayView(snapshot, key, now) {
  const date = new Date(dayTime(key) + CHINA_OFFSET);
  const heading = (date.getUTCMonth() + 1) + '月' + date.getUTCDate() + '日';
  const weekday = WEEKDAYS[(date.getUTCDay() + 6) % 7];
  const empty = {
    heading: heading, weekday: '周' + weekday, weekLabel: '',
    events: [], emptyTitle: '尚未同步课表', emptyText: '等待手机课表', countText: '',
    syncText: '未同步'
  };
  if (!snapshot) return empty;
  const week = Math.floor((weekStart(dayTime(key)) - dayTime(snapshot.timetable.termStart)) / (7 * DAY_MS)) + 1;
  empty.weekLabel = week > 0 ? '第' + week + '周' : '学期未开始';
  empty.syncText = '更新于 ' + monthDay(dayKey(snapshot.generatedAt)) + ' ' +
    clockText(snapshot.generatedAt);
  if (key < snapshot.rangeStart || key > snapshot.rangeEnd) {
    empty.emptyTitle = '这一天尚未同步';
    empty.emptyText = '已保存 ' + monthDay(snapshot.rangeStart) + ' 至 ' + monthDay(snapshot.rangeEnd);
    return empty;
  }
  const start = dayTime(key);
  empty.events = snapshot.events.filter(function(e) {
    return e.startAt < start + DAY_MS && e.endAt > start;
  }).map(function(e) {
    const active = now >= e.startAt && now < e.endAt;
    const ended = now >= e.endAt;
    let state = '';
    if (active) state = '进行中';
    else if (ended) state = '已结束';
    else if (dayKey(now) === key) {
      const minutes = Math.ceil((e.startAt - now) / 60000);
      state = minutes < 60 ? minutes + '分钟后' : Math.floor(minutes / 60) + '小时后';
    }
    const color = e.kind === 'EXAM' ? '#FFBE78' : (active ? '#86E1B0' : '#85B8FF');
    const continuation = dayKey(e.startAt) !== key ? '前日 ' : '';
    const nextDay = dayKey(e.endAt - 1) !== key ? '次日 ' : '';
    return {
      id: e.id, title: e.title, room: e.room || '地点待定', teacher: e.teacher || '教师未提供',
      sections: e.kind === 'CLASS' ? e.sections : '',
      kindText: e.kind === 'EXAM' ? '考试' : (e.kind === 'CLASS' ? '课程' : '日程'),
      time: continuation + clockText(e.startAt) + ' - ' + nextDay + clockText(e.endAt),
      state: state, accent: ended ? '#A4ABB5' : color,
      backgroundColor: active ? '#152920' : '#181C21'
    };
  });
  empty.countText = empty.events.length ? empty.events.length + '项安排' : '';
  empty.emptyTitle = '今日无课';
  empty.emptyText = dayKey(now) === key ? '按自己的节奏安排今天' : '这一天没有课程安排';
  return empty;
}

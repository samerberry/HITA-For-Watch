import { checksum, parseSnapshot, utf8Bytes, MAX_PAYLOAD_BYTES } from './schedule.js';
import { hasCharacters } from './characters.js';

export const CHANNEL = 'hita-watch';
export const CHUNK_BYTES = 384;
export const TRANSFER_TIMEOUT = 90000;

export function packet(type, id) {
  return { p: CHANNEL, v: 1, t: type, id: id };
}

export function createReceiver(options) {
  let pending = null;
  let completed = '';
  let committing = false;
  function send(type, id, next, error) {
    const value = packet(type, id);
    if (next !== undefined) value.next = next;
    if (error) value.error = error;
    options.send(JSON.stringify(value));
  }
  function fail(id, reason) {
    send('error', id, undefined, reason);
    pending = null;
    options.state('error', reason);
  }
  return {
    tick: function(now) {
      if (pending && !committing && now - pending.lastAt > TRANSFER_TIMEOUT) fail(pending.id, 'TIMEOUT');
    },
    cancel: function() {
      if (!committing) pending = null;
    },
    receive: function(raw, now) {
      let p;
      try {
        if (typeof raw !== 'string' || utf8Bytes(raw) > 2048) return;
        p = JSON.parse(raw);
      } catch (_) { return; }
      if (!p || p.p !== CHANNEL || p.v !== 1 || typeof p.id !== 'string' ||
        !hasCharacters(p.id, 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-', 1, 64)) return;
      if (p.t === 'end' && p.id === completed) { send('done', p.id); return; }
      if (committing) { send('busy', p.id); return; }
      if (p.t === 'begin') {
        if (pending && pending.id === p.id) {
          pending.lastAt = now; send('ack', p.id, pending.next); return;
        }
        if (!Number.isInteger(p.total) || p.total < 1 || p.total > 256 ||
          !Number.isInteger(p.bytes) || p.bytes < 1 || p.bytes > MAX_PAYLOAD_BYTES ||
          typeof p.crc !== 'string' || !hasCharacters(p.crc, 'abcdef0123456789', 8, 8)) {
          fail(p.id, 'SIZE'); return;
        }
        pending = { id: p.id, count: p.total, bytes: p.bytes, crc: p.crc,
          next: 0, parts: [], received: 0, lastAt: now };
        options.state('receiving', '0');
        send('ack', p.id, 0);
        return;
      }
      if (!pending || pending.id !== p.id) return;
      pending.lastAt = now;
      if (p.t === 'chunk') {
        if (!Number.isInteger(p.n) || typeof p.data !== 'string' || !p.data ||
          utf8Bytes(p.data) > CHUNK_BYTES) { fail(p.id, 'CHUNK'); return; }
        if (p.n < pending.next && pending.parts[p.n] === p.data) {
          send('ack', p.id, pending.next); return;
        }
        if (p.n !== pending.next || p.n >= pending.count) {
          send('ack', p.id, pending.next); return;
        }
        pending.received += utf8Bytes(p.data);
        if (pending.received > pending.bytes) { fail(p.id, 'SIZE'); return; }
        pending.parts.push(p.data);
        pending.next++;
        options.state('receiving', '' + Math.floor(pending.next / pending.count * 100));
        send('ack', p.id, pending.next);
      } else if (p.t === 'end') {
        if (pending.next !== pending.count) { send('ack', p.id, pending.next); return; }
        const text = pending.parts.join('');
        if (pending.received !== pending.bytes || checksum(text) !== pending.crc) {
          fail(p.id, 'CHECKSUM'); return;
        }
        let data;
        try { data = parseSnapshot(text); } catch (_) { fail(p.id, 'INVALID_DATA'); return; }
        const id = p.id;
        committing = true;
        options.state('saving', '');
        options.persist(data, function(error, saved) {
          committing = false;
          if (error) { fail(id, error.message === 'STALE' ? 'STALE' : 'STORAGE'); return; }
          completed = id;
          pending = null;
          options.complete(saved);
          options.state('ready', '');
          send('done', id);
        });
      }
    }
  };
}

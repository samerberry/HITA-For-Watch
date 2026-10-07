import { checksum, parseSnapshot, splitUtf8, MAX_PAYLOAD_BYTES } from './schedule.js';

// Lite storage reads at most 128 bytes per value on the Windows SDK.
// Leave room below that boundary; never publish a slot until every fragment verifies.
const STORAGE_FRAGMENT_BYTES = 120;
const MAX_STORAGE_FRAGMENTS = Math.ceil(MAX_PAYLOAD_BYTES / (STORAGE_FRAGMENT_BYTES - 3));
export function createSnapshotStore(storage) {
  let activeSlot = '';
  let generation = 0;
  let busy = false;
  let loaded = false;
  let current = null;
  function read(key, done) {
    storage.get({ key: key, default: '', success: function(value) { done(null, value); },
      fail: function() { done(new Error('STORAGE_READ')); } });
  }
  function write(key, value, done) {
    storage.set({ key: key, value: value, success: function() { done(null); },
      fail: function() { done(new Error('STORAGE_WRITE')); } });
  }
  function readSlot(slot, done) {
    read('hita_' + slot + '_meta', function(error, text) {
      let meta;
      try {
        meta = JSON.parse(text);
        if (!meta || !Number.isInteger(meta.generation) || meta.generation < 1 ||
          !Number.isInteger(meta.count) || meta.count < 1 || meta.count > MAX_STORAGE_FRAGMENTS ||
          typeof meta.crc !== 'string') throw new Error('META');
      } catch (e) {
        if (text) console.warn('HITA_CACHE_META_REJECTED ' + e.message);
        done(error || new Error('EMPTY'));
        return;
      }
      let index = 0;
      let raw = '';
      function next() {
        if (index === meta.count) {
          try {
            const actual = checksum(raw);
            if (actual !== meta.crc) {
              console.warn('HITA_CACHE_CHECKSUM length=' + raw.length + ' expected=' + meta.crc + ' actual=' + actual);
              throw new Error('CHECKSUM');
            }
            done(null, { slot: slot, generation: meta.generation, snapshot: parseSnapshot(raw) });
          } catch (e) {
            console.warn('HITA_CACHE_PAYLOAD_REJECTED ' + e.message);
            done(e);
          }
          return;
        }
        read('hita_' + slot + '_' + index++, function(e, part) {
          if (e || typeof part !== 'string' || !part || raw.length + part.length > MAX_PAYLOAD_BYTES) {
            done(e || new Error('FRAGMENT')); return;
          }
          raw += part;
          next();
        });
      }
      next();
    });
  }
  return {
    load: function(done) {
      readSlot('a', function(errorA, a) {
        readSlot('b', function(errorB, b) {
          if ((errorA && errorA.message === 'STORAGE_READ') ||
            (errorB && errorB.message === 'STORAGE_READ')) {
            loaded = false;
            done(new Error('STORAGE_READ'), null);
            return;
          }
          const chosen = !errorA && (!b || a.generation >= b.generation) ? a : (!errorB ? b : null);
          activeSlot = chosen ? chosen.slot : '';
          generation = chosen ? chosen.generation : 0;
          current = chosen ? chosen.snapshot : null;
          loaded = true;
          done(null, current);
        });
      });
    },
    save: function(snapshot, done) {
      if (!loaded || busy) { done(new Error('STORAGE_BUSY')); return; }
      let clean;
      try { clean = parseSnapshot(JSON.stringify(snapshot)); } catch (e) { done(e); return; }
      if (current && clean.generatedAt < current.generatedAt) { done(new Error('STALE')); return; }
      const raw = JSON.stringify(clean);
      const pieces = splitUtf8(raw, STORAGE_FRAGMENT_BYTES);
      const slot = activeSlot === 'a' ? 'b' : 'a';
      const nextGeneration = generation + 1;
      const meta = JSON.stringify({ generation: nextGeneration, count: pieces.length, crc: checksum(raw) });
      busy = true;
      let index = 0;
      function finish(error) { busy = false; done(error, error ? null : clean); }
      function next() {
        if (index === pieces.length) {
          write('hita_' + slot + '_meta', meta, function(e) {
            if (e) { finish(e); return; }
            readSlot(slot, function(error, saved) {
              if (error) { finish(error); return; }
              activeSlot = slot;
              generation = nextGeneration;
              current = saved.snapshot;
              finish(null);
            });
          });
          return;
        }
        const part = index++;
        write('hita_' + slot + '_' + part, pieces[part], function(e) {
          if (e) finish(e);
          else next();
        });
      }
      // Invalidate the inactive descriptor before reusing its fragments.
      write('hita_' + slot + '_meta', '', function(e) {
        if (e) finish(e);
        else next();
      });
    }
  };
}

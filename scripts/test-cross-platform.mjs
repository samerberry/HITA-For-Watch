import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import assert from 'node:assert/strict';
import { fixture, NOW } from '../tests/fixtures.mjs';
import { createReceiver } from '../entry/src/main/js/MainAbility/common/sync-protocol.js';
import { parseSnapshot } from '../entry/src/main/js/MainAbility/common/schedule.js';

async function verify(dropAck, dropDone) {
  const java = spawn(process.env.HITA_JAVA, ['-Dfile.encoding=UTF-8', '-cp', process.env.HITA_JAVA_CLASSPATH, 'ProtocolHarness']);
  let committed = 0, complete = false, lostAck = false, lostDone = false;
  let errorOutput = '';
  const source = fixture();
  source.events[0].title += '（跨语言测试📚）';
  const receiver = createReceiver({
    send: text => {
      const p = JSON.parse(text);
      if (dropAck && p.t === 'ack' && p.next === 1 && !lostAck) {
        lostAck = true; java.stdin.write('!timeout\n'); return;
      }
      if (dropDone && p.t === 'done' && !lostDone) {
        lostDone = true; java.stdin.write('!timeout\n'); return;
      }
      java.stdin.write(text + '\n');
    },
    state() {},
    persist: (data, done) => queueMicrotask(() => done(null, data)),
    complete: data => {
      committed++;
      assert.deepEqual(data, parseSnapshot(JSON.stringify(source)));
    }
  });
  java.stderr.on('data', text => { errorOutput += text; });
  const lines = createInterface({ input: java.stdout });
  lines.on('line', line => {
    if (line.startsWith('TX ')) receiver.receive(line.slice(3), NOW);
    else if (line === 'DONE') complete = true;
    else if (line.startsWith('FAIL')) errorOutput += line;
  });
  java.stdin.write(JSON.stringify(source) + '\n');
  const timeout = setTimeout(() => java.kill(), 12000);
  const code = await new Promise(resolve => java.on('close', resolve));
  clearTimeout(timeout);
  assert.equal(code, 0, errorOutput);
  assert.equal(complete, true, errorOutput);
  assert.equal(committed, 1, 'Duplicate packets must never duplicate persisted events');
  assert.equal(lostAck, dropAck);
  assert.equal(lostDone, dropDone);
}
await verify(false, false);
await verify(true, false);
await verify(false, true);
await verify(true, true);
console.log('PASS: Android SDK API compilation and 4 Java-to-watch transfers (normal / ACK loss / DONE loss / both).');

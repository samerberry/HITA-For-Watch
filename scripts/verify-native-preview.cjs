const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { checkBundle, sdk, bundle } = require('./check-native-runtime.cjs');

async function seedCourses(directory) {
  const { fixture, NOW } = await import('../tests/fixtures.mjs');
  const { createSnapshotStore } = await import('../entry/src/main/js/MainAbility/common/snapshot-store.js');
  const { weekStart, dayTime, dayKey } = await import('../entry/src/main/js/MainAbility/common/schedule.js');
  const data = fixture();
  const shift = weekStart(Date.now()) - weekStart(NOW);
  data.generatedAt = Date.now();
  data.rangeStart = dayKey(dayTime(data.rangeStart) + shift);
  data.rangeEnd = dayKey(dayTime(data.rangeEnd) + shift);
  data.timetable.termStart = dayKey(dayTime(data.timetable.termStart) + shift);
  for (const event of data.events) { event.startAt += shift; event.endAt += shift; }
  fs.mkdirSync(directory, { recursive: true });
  const store = createSnapshotStore({
    get({ key, default: fallback, success }) {
      const file = path.join(directory, key);
      success(fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : fallback);
    },
    set({ key, value, success }) { fs.writeFileSync(path.join(directory, key), value); success(); }
  });
  await new Promise((resolve, reject) => store.load(error => error ? reject(error) : resolve()));
  await new Promise((resolve, reject) => store.save(data, error => error ? reject(error) : resolve()));
  return data;
}

async function verify(profile, layout) {
  assert.equal(process.platform, 'win32', 'This smoke test currently uses the Windows SDK named pipes.');
  checkBundle(bundle);
  console.log('Native device: ' + profile.id);
  const courses = process.argv.includes('--courses');
  const mockShape = process.argv.includes('--mock-shape') && layout.shape === 'circle';
  const output = path.resolve(__dirname, '../artifacts/native-preview',
    Date.now() + '-' + profile.id + (courses ? '-courses' : '') + (mockShape ? '-shape-mock' : ''));
  // Mirror the IDE layout, with settings and any simulator data isolated per run.
  const settingsDirectory = path.join(output, '.idea/previewer');
  fs.mkdirSync(settingsDirectory, { recursive: true });
  const config = path.join(settingsDirectory, 'settings.json');
  fs.writeFileSync(config, JSON.stringify({
    setting: { '1.0.0': {
      KeepScreenOnState: { args: { KeepScreenOnState: true } },
      Brightness: { args: { Brightness: 170 } }
    }, '1.0.1': { Language: { args: { Language: 'zh-CN' } } } },
    frontend: { '1.0.0': {
      Resolution: { args: { Resolution: layout.width + '*' + layout.height } },
      DeviceType: { args: { DeviceType: 'liteWearable' } }
    } }
  }));
  const prefix = 'hita_smoke_' + process.pid + '_' + Date.now();
  const servers = [], sockets = new Set(), frames = [], commands = [], replies = [];
  let commandSocket;
  let child, ws, timer, exitPromise, stopped = false, closed = false, passed = false;
  let commandBuffer = '', stdout = '', stderr = '', socketError = '';
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  function latestJpeg() {
    for (let i = frames.length - 1; i >= 0; i--) {
      const frame = frames[i];
      const start = frame.indexOf(Buffer.from([0xff, 0xd8, 0xff]));
      const end = frame.indexOf(Buffer.from([0xff, 0xd9]), start);
      if (start >= 0 && end > start) return frame.subarray(start, end + 2);
    }
    return null;
  }
  async function click(x, y) {
    assert.ok(commandSocket, 'Native command channel is not connected.');
    for (const command of ['MousePress', 'MouseRelease']) {
      const message = { version: '1.0.0', command, type: 'action', args: { x, y, duration: 120 } };
      commands.push(message);
      commandSocket.write(JSON.stringify(message) + '\0');
      await delay(120);
    }
  }
  async function swipe(x1, y1, x2, y2) {
    for (let step = 0; step <= 8; step++) {
      const message = { version: '1.0.0', type: 'action',
        command: step === 0 ? 'MousePress' : step === 8 ? 'MouseRelease' : 'MouseMove',
        args: { x: Math.round(x1 + (x2 - x1) * step / 8),
          y: Math.round(y1 + (y2 - y1) * step / 8), duration: 80 } };
      commands.push(message);
      commandSocket.write(JSON.stringify(message) + '\0');
      await delay(80);
    }
  }
  async function checkClick(label, x, y) {
    const before = latestJpeg();
    assert.ok(before, 'No initial image for ' + label);
    fs.writeFileSync(path.join(output, label + '-before.jpg'), before);
    await click(x, y);
    await delay(1000);
    const after = latestJpeg();
    fs.writeFileSync(path.join(output, label + '-after.jpg'), after);
    assert.ok(!before.equals(after), label + ' did not change the native screen.');
    console.log('PASS: native click ' + label);
  }
  function connectImages(port, attempt = 0) {
    if (stopped || closed) return;
    const connection = new WebSocket('ws://127.0.0.1:' + port);
    ws = connection;
    connection.binaryType = 'arraybuffer';
    connection.onmessage = event => {
      if (typeof event.data !== 'string') frames.push(Buffer.from(event.data));
    };
    connection.onerror = () => {};
    connection.onclose = () => {
      if (!stopped && !closed && frames.length === 0 && attempt < 10) {
        timer = setTimeout(() => connectImages(port, attempt + 1), 150);
      }
    };
  }
  try {
    for (const kind of ['command', 'image', 'trace']) {
      const server = net.createServer(socket => {
        if (kind === 'command') commandSocket = socket;
        sockets.add(socket);
        socket.on('close', () => sockets.delete(socket));
        socket.on('error', error => { if (!stopped) socketError = error.message; });
        socket.on('data', chunk => {
          if (kind !== 'command') return;
          commandBuffer += chunk.toString();
          let end;
          while ((end = commandBuffer.indexOf('\0')) >= 0) {
            const message = commandBuffer.slice(0, end);
            commandBuffer = commandBuffer.slice(end + 1);
            try {
              const json = JSON.parse(message);
              replies.push(json);
              if (json.MessageType === 'imageWebsocket' && !ws) connectImages(json.args.port);
            } catch (error) { socketError = error.message; }
          }
        });
      });
      servers.push(server);
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen('\\\\.\\pipe\\' + prefix + '_' + (kind === 'trace' ? 'trace' : kind + 'Pipe'), resolve);
      });
    }
    const portServer = net.createServer();
    await new Promise((resolve, reject) => {
      portServer.once('error', reject);
      portServer.listen(0, '127.0.0.1', resolve);
    });
    const port = portServer.address().port;
    await new Promise(resolve => portServer.close(resolve));
    const bin = path.join(sdk, 'hms/previewer/liteWearable/bin');
    // Lite stores preferences under cwd/file_system; Program Files is not writable.
    // Fonts are resolved relative to cwd, so keep the SDK's matching config beside it.
    const workingDirectory = path.join(output, 'runtime/bin');
    fs.mkdirSync(workingDirectory, { recursive: true });
    fs.cpSync(path.join(bin, '../config'), path.join(output, 'runtime/config'), { recursive: true });
    const preferences = path.join(workingDirectory, 'file_system/app/ace/data/entry/kvstore');
    const snapshot = courses ? await seedCourses(preferences) : null;
    const manifest = JSON.parse(fs.readFileSync(path.join(bundle, 'manifest.json'), 'utf8'));
    let runtimeBundle = bundle;
    if (mockShape) {
      // The Windows Lite SDK returns "rect" unconditionally. Override only that API field in a test copy.
      runtimeBundle = path.join(output, 'bundle');
      fs.cpSync(bundle, runtimeBundle, { recursive: true });
      const prelude = '(function(native){requireNative=function(name){var api=native(name);' +
        'if(name!=="system.device")return api;return {getInfo:function(options){var success=options.success;' +
        'options.success=function(info){info.screenShape="circle";success(info);};api.getInfo(options);}};};})(requireNative);\n';
      for (const page of manifest.pages) {
        const file = path.join(runtimeBundle, page + '.js');
        fs.writeFileSync(file, prelude + fs.readFileSync(file, 'utf8'));
      }
      console.log('TEST OVERRIDE: screenShape=circle in isolated bundle copy; not a real device shape check.');
    }
    child = spawn(path.join(bin, 'Simulator.exe'), [
      '-refresh', 'region', '-projectID', '1', '-ts', prefix + '_trace',
      '-j', runtimeBundle, '-s', prefix, '-cpm', 'false',
      '-device', 'liteWearable', '-shape', layout.shape, '-sd', String(profile.screenDensity),
      '-pjId', 'hita_smoke', '-bn', manifest.appID,
      '-or', String(layout.width), String(layout.height),
      '-cr', String(layout.width), String(layout.height), '-hs', '524288',
      '-f', config, '-n', 'entry', '-url', manifest.pages[0], '-ilt', 'true', '-lws', String(port)
    ], { cwd: workingDirectory, windowsHide: true });
    child.stdout.on('data', data => { stdout += data; });
    child.stderr.on('data', data => { stderr += data; });
    exitPromise = new Promise(resolve => {
      child.once('error', error => { socketError = error.message; });
      child.once('close', (code, signal) => { closed = true; resolve({ code, signal }); });
    });
    const dayX = index => Math.round((layout.width - layout.weekWidth) / 2 +
      (layout.dayWidth + 2) * (index + 0.5));
    const dayY = layout.topInset + 40 + 35;
    const todayX = (layout.width + layout.summaryWidth) / 2 - 27;
    const todayY = layout.topInset + 40 + 70 + 16;
    const backX = (layout.width - layout.syncHeadingWidth) / 2 + 24;
    const syncX = (layout.width + layout.topWidth) / 2 - 22;
    {
      for (let i = 0; i < 50 && !latestJpeg() && !closed; i++) await delay(100);
      for (let i = 0; i < 100 && !stdout.includes('HITA_CACHE_READY ') && !closed; i++) await delay(100);
      await delay(700);
      const todayIndex = (new Date(Date.now() + 8 * 3600000).getUTCDay() + 6) % 7;
      assert.ok(stdout.includes('HITA_DISPLAY ' + layout.width + 'x' + layout.height + ' ' + layout.shape),
        'Native device.getInfo did not select the expected layout; inspect ' + output);
      assert.ok(stdout.includes('HITA_CACHE_READY ' + (snapshot ? snapshot.events.length : 0)),
        'Native storage did not load the expected snapshot; inspect ' + output);
      await checkClick('select-day', dayX(todayIndex === 0 ? 1 : 0), dayY);
      await checkClick('today', todayX, todayY);
      if (courses) {
        if (todayIndex !== 0) await checkClick('courses-monday', dayX(0), dayY);
        await checkClick('long-course', dayX(4), dayY);
        const beforeScroll = latestJpeg();
        await swipe(layout.width / 2, layout.height - 80, layout.width / 2, layout.listTop + 30);
        await delay(1000);
        fs.writeFileSync(path.join(output, 'long-course-bottom.jpg'), latestJpeg());
        assert.ok(!beforeScroll.equals(latestJpeg()), 'Native course list did not scroll.');
        await checkClick('saved-sync', syncX, layout.topInset + 20);
        const { viewData } = await import('../entry/src/main/js/MainAbility/common/view-model.js');
        const view = viewData(snapshot, snapshot.rangeStart, Date.now(), layout);
        const rowHeight = layout.syncIconSize + 184 + view.savedTitleHeight + view.savedRangeHeight;
        const offset = Math.max(0, rowHeight + layout.syncBottomInset - layout.syncBodyHeight);
        if (offset > 0) {
          await swipe(layout.width / 2, layout.height - 70, layout.width / 2, layout.topInset + 90);
          await delay(1000);
        }
        await checkClick('saved-request', layout.width / 2, layout.topInset + 50 + rowHeight - 25 - offset);
        await checkClick('saved-back', backX, layout.topInset + 25);
        if (todayIndex !== 4) await checkClick('courses-today', todayX, todayY);
      } else {
        await checkClick('empty-sync', layout.width / 2, layout.listTop + 182);
        await checkClick('request-sync', layout.width / 2, layout.topInset + 235 + layout.syncIconSize);
        await checkClick('empty-back', backX, layout.topInset + 25);
      }
      await checkClick('open-sync', syncX, layout.topInset + 20);
      await checkClick('back', backX, layout.topInset + 25);
      const beforeSwipe = latestJpeg();
      fs.writeFileSync(path.join(output, 'swipe-before.jpg'), beforeSwipe);
      await swipe(Math.round(layout.width * (todayIndex === 6 ? 0.25 : 0.75)), layout.listTop + 100,
        Math.round(layout.width * (todayIndex === 6 ? 0.75 : 0.25)), layout.listTop + 100);
      await delay(1000);
      fs.writeFileSync(path.join(output, 'swipe-after.jpg'), latestJpeg());
      assert.ok(!beforeSwipe.equals(latestJpeg()), 'Horizontal swipe did not change the native screen.');
      console.log('PASS: native horizontal swipe');
      await checkClick('swipe-today', todayX, todayY);
    }
    // Stay alive through the page's first 15-second refresh, not just its first frame.
    let durationTimer;
    const earlyExit = await Promise.race([
      exitPromise,
      new Promise(resolve => { durationTimer = setTimeout(() => resolve(null), 17000); })
    ]);
    clearTimeout(durationTimer);
    assert.equal(earlyExit, null, 'Simulator exited before the smoke test finished: ' + JSON.stringify(earlyExit));
    const todayIndex = (new Date(Date.now() + 8 * 3600000).getUTCDay() + 6) % 7;
    const dayOrder = todayIndex === 0 ? [1, 2, 3, 4, 5, 6, 0] : [0, 1, 2, 3, 4, 5, 6];
    for (let round = 0; round < 2; round++) {
      for (const index of dayOrder) {
        await checkClick('after-refresh-' + round + '-day-' + index, dayX(index), dayY);
      }
    }
    assert.equal(closed, false, 'Simulator exited during repeated date selection.');
    assert.equal(socketError, '', socketError);
    assert.ok(!/JsEngine Crash|JS HEAP OOM|\[JS Exception\]|Eval JS file failed|Nothing to render|ReferenceError|SyntaxError|HITA_STORAGE_READ_FAILED/.test(stdout + stderr),
      'Native JS failed; inspect ' + path.join(output, 'simulator.log'));
    assert.ok(fs.existsSync(preferences),
      'The official simulator did not initialize writable preference storage.');
    const jpeg = frames.map(frame => {
      const start = frame.indexOf(Buffer.from([0xff, 0xd8, 0xff]));
      const end = frame.indexOf(Buffer.from([0xff, 0xd9]), start);
      return start >= 0 && end > start ? frame.subarray(start, end + 2) : null;
    }).find(Boolean);
    assert.ok(jpeg, 'The official simulator did not deliver a complete image.');
    fs.writeFileSync(path.join(output, 'official-preview.jpg'), jpeg);
    passed = true;
    console.log('PASS: official Lite simulator rendered the entry build, handled clicks/swipes and survived the 17-second refresh check.');
    console.log('Screenshot: ' + path.join(output, 'official-preview.jpg'));
  } finally {
    stopped = true;
    clearTimeout(timer);
    if (ws) ws.close();
    if (child && !closed) child.kill();
    if (exitPromise) await exitPromise;
    for (const socket of sockets) socket.destroy();
    for (const server of servers) if (server.listening) await new Promise(resolve => server.close(resolve));
    fs.writeFileSync(path.join(output, 'simulator.log'), stdout + stderr);
    fs.writeFileSync(path.join(output, 'commands.json'), JSON.stringify(commands, null, 2));
    fs.writeFileSync(path.join(output, 'replies.json'), JSON.stringify(replies, null, 2));
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({
      passed, bundle, device: profile, courses, mockShape, frames: frames.length, bytes: frames.reduce((n, frame) => n + frame.length, 0),
      socketError, timestamp: new Date().toISOString()
    }, null, 2));
  }
}

async function main() {
  const { previewDevices } = await import('../preview/devices.mjs');
  const { displayLayout } = await import('../entry/src/main/js/MainAbility/common/display-layout.js');
  const index = process.argv.indexOf('--device');
  const selected = index >= 0 ? previewDevices.filter(device => device.id === process.argv[index + 1]) :
    (process.argv.includes('--all') ? previewDevices : previewDevices.slice(0, 1));
  assert.ok(selected.length, 'Unknown --device; use ' + previewDevices.map(device => device.id).join(', '));
  for (const profile of selected) await verify(profile, displayLayout(profile));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });

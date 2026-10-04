'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const M = require('../model.cjs');
const { createVisitorServer } = require('../server.cjs');
const root = path.resolve(__dirname, '../..');
const gameRoot = path.resolve(process.env.HEAT_NATIVE_GAME_ROOT || path.join(root, '../..'));
const runtime = path.join(gameRoot, 'recovery/runtime/Godot.exe');
const helper = path.join(gameRoot, 'playable/tests/run_heat_e2e.gd');
const hash = file => fs.existsSync(file) ? crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') : null;

test('actual local launch → native play → checked report → Degrees and trophy survive restart',
  { timeout: 40000, skip: !fs.existsSync(runtime) || !fs.existsSync(helper) }, async () => {
    const normalFiles = ['first-plot.json', 'first-plot.json.bak'].map(f => path.join(gameRoot, 'saves', f));
    const original = normalFiles.map(hash);
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'heat-native-chain-'));
    let bridge, child, finished;
    const listen = async () => {
      await new Promise(resolve => bridge.server.listen(0, '127.0.0.1', resolve));
      return `http://127.0.0.1:${bridge.server.address().port}`;
    };
    try {
      bridge = createVisitorServer({ root, stateDir: temp, gameRoot, spawnGame(executable, args, options) {
        const split = args.indexOf('--');
        const isolated = ['--headless', ...args.slice(0, split), '--script', 'tests/run_heat_e2e.gd',
          '--', ...args.slice(split + 1), '--test-save=' + path.join(temp, 'fixture', 'first-plot.json')];
        child = spawn(executable, isolated, options);
        finished = new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
        return child;
      } });
      let base = await listen();
      const launch = await fetch(base + '/api/visitor/launch', { method: 'POST',
        headers: { Origin: base, 'Content-Type': 'application/json' }, body: '{}' });
      assert.equal(launch.status, 200); const started = await launch.json();
      assert.equal(started.running, true); assert.ok(M.SESSION_ID.test(started.session_id));
      assert.equal(await finished, 0, fs.existsSync(path.join(temp, 'game.log')) ? fs.readFileSync(path.join(temp, 'game.log'), 'utf8') : 'No native log');
      const log = fs.readFileSync(path.join(temp, 'game.log'), 'utf8');
      assert.match(log, /HEAT_NATIVE_E2E_OK/); assert.doesNotMatch(log, /SCRIPT ERROR:|Parse Error:/);
      const report = M.readJSON(path.join(temp, 'reports', bridge.identity.id + '.json'), M.validateReport);
      assert.equal(report.profile.id, bridge.identity.id); assert.equal(report.session.id, started.session_id);
      assert.ok(report.session.active_seconds >= 5 && report.session.active_seconds <= 20);
      assert.equal(report.camps[0].metrics.nerve_center_online, true);
      assert.ok(report.carried_items.length > 0);
      let snapshot = await (await fetch(base + '/api/visitor')).json();
      assert.equal(snapshot.degrees.balance, 100); assert.equal(snapshot.degrees.attendance_days, 1);
      assert.equal(snapshot.trophies.granted.length, 1); assert.equal(snapshot.trophies.granted[0].id, 'visitor-first-claim');
      assert.equal(snapshot.launch.running, false); assert.deepEqual(snapshot.errors, []);
      const statement = structuredClone(snapshot.degrees.transactions);
      snapshot = await (await fetch(base + '/api/visitor')).json();
      assert.equal(snapshot.degrees.balance, 100); assert.equal(snapshot.trophies.granted.length, 1);
      await new Promise(resolve => bridge.server.close(resolve));
      bridge = createVisitorServer({ root, stateDir: temp, gameRoot }); base = await listen();
      snapshot = await (await fetch(base + '/api/visitor')).json();
      assert.equal(snapshot.degrees.balance, 100); assert.deepEqual(snapshot.degrees.transactions, statement);
      assert.equal(snapshot.trophies.granted.length, 1); assert.equal(snapshot.launch.running, false);
      assert.deepEqual(normalFiles.map(hash), original, 'Normal save and backup must remain unchanged.');
    } finally {
      if (child && child.exitCode === null) child.kill();
      if (bridge?.server.listening) await new Promise(resolve => bridge.server.close(resolve));
      assert.deepEqual(normalFiles.map(hash), original, 'Normal save and backup must remain unchanged.');
      const resolved = fs.realpathSync(temp);
      assert.ok(resolved.startsWith(fs.realpathSync(os.tmpdir()) + path.sep));
      fs.rmSync(resolved, { recursive: true, force: true });
    }
  });

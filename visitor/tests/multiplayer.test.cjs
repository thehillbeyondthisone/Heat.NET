'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { EventEmitter } = require('node:events');
const { createVisitorServer } = require('../server.cjs');
const D = require('../degrees.cjs');
const M = require('../model.cjs');
const root = path.resolve(__dirname, '../..');
const gameRoot = path.resolve(root, '../..');
const runtime = path.join(gameRoot, 'recovery/runtime/Godot.exe');
const available = fs.existsSync(runtime) && fs.existsSync(path.join(gameRoot, 'playable/scripts/multiplayer_authority.gd'));
const normalPaths = ['saves/first-plot.json', 'saves/first-plot.json.bak', 'saves/heat-net/degrees.json', 'saves/heat-net/trophies.json'].map(f => path.join(gameRoot, f));
const hashes = () => normalPaths.map(f => fs.existsSync(f) ? crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex') : null);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function setup(now, extra = {}) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'heat-shared-'));
  let bridge, base;
  async function open() { bridge = createVisitorServer({ root, stateDir: temp, gameRoot, now, ...extra }); await new Promise(resolve => bridge.server.listen(0, '127.0.0.1', resolve)); base = `http://127.0.0.1:${bridge.server.address().port}`; }
  await open();
  const api = async (route, data, cookie = '', token = '') => {
    const res = await fetch(base + '/api/visitor' + route, { method: data === undefined ? 'GET' : 'POST', headers: { Origin: base, Cookie: cookie,
      ...(token ? { Authorization: 'Bearer ' + token } : {}), 'Content-Type': 'application/json' }, body: data === undefined ? undefined : JSON.stringify(data) });
    return { status: res.status, data: await res.json(), cookie: (res.headers.get('set-cookie') || '').split(';')[0] };
  };
  async function account(name) { const result = await api('/auth/register', { username: name, display_name: name, password: crypto.randomBytes(24).toString('hex') }); assert.equal(result.status, 200); return result; }
  async function join(cookie) { const ticket = await api('/multiplayer/admission', {}, cookie); assert.equal(ticket.status, 200); const client = await api('/multiplayer/connect', { ticket: ticket.data.ticket }); assert.equal(client.status, 200, JSON.stringify(client.data)); return client.data; }
  return { temp, api, account, join, get base() { return base; }, async restart() { await new Promise(resolve => bridge.server.close(resolve)); await open(); },
    async close() { if (bridge.server.listening) await new Promise(resolve => bridge.server.close(resolve)); const safe = fs.realpathSync(temp); assert.ok(safe.startsWith(fs.realpathSync(os.tmpdir()) + path.sep)); fs.rmSync(safe, { recursive: true, force: true }); } };
}

test('shared authoritative claims, ownership, reports/replays, pause, reconnect and durable award retry', { skip: !available, timeout: 60000 }, async () => {
  const original = hashes(); let time = 1780000000; const app = await setup(() => time);
  try {
    const a = await app.account('shared_alpha'), b = await app.account('shared_beta');
    assert.equal((await app.api('/multiplayer/admission', {})).status, 401);
    const ticket = await app.api('/multiplayer/admission', {}, a.cookie);
    let alice = (await app.api('/multiplayer/connect', { ticket: ticket.data.ticket })).data;
    assert.equal((await app.api('/multiplayer/connect', { ticket: ticket.data.ticket })).status, 400);
    let bob = await app.join(b.cookie);
    const input = (client, seq, action) => app.api('/multiplayer/input', { seq, action }, '', client.token);
    const claim = { type: 'claim', camp: 735, corporation: 'bruteforce' };
    let result = await input(alice, 1, claim); assert.equal(result.data.ok, true);
    const retry = await input(alice, 1, claim); assert.equal(retry.data.retry, true); assert.equal(retry.data.world.camps.length, 1);
    assert.equal((await input(alice, 1, { ...claim, camp: 736 })).status, 400);
    assert.equal((await input(alice, 3, claim)).status, 400);
    result = await input(bob, 1, claim); assert.equal(result.data.ok, false); assert.match(result.data.error, /occupied/);
    result = await input(bob, 2, { ...claim, camp: 736 }); assert.equal(result.data.ok, true);
    result = await input(bob, 3, { type: 'build', camp: 735, kind: 'nc', x: 10, z: 33 }); assert.equal(result.data.ok, false); assert.match(result.data.error, /owner/);
    assert.equal((await input(alice, 2, { type: 'report', active_seconds: 99999, awards: ['visitor-two-camps'] })).status, 400);
    assert.equal((await input(alice, 2, { type: 'build', camp: 735, kind: 'nc', x: 999, z: 0 })).status, 400);
    result = await input(alice, 2, { type: 'build', camp: 735, kind: 'nc', x: 10, z: 33 }); assert.equal(result.data.ok, true);
    assert.equal((await app.api('/multiplayer/state', undefined, '', '0'.repeat(64))).status, 400);
    const seen = await app.api('/multiplayer/state', undefined, '', bob.token); assert.equal(seen.data.world.camps[0].entities[0].kind, 'nc');
    await wait(3500);
    let state = (await app.api('/multiplayer/state', undefined, '', alice.token)).data;
    assert.equal(state.world.tick_hz, 30); assert.equal(state.world.camps[0].nerve_center_online, true);
    assert.ok(state.world.camps[0].tick >= 90);
    assert.equal((await app.api('', undefined, a.cookie)).data.degrees.balance, 0, 'Admission/construction alone earns no attendance.');
    time += 4;
    // Interrupt each existing award store after the server receipt commits, then retry it.
    fs.mkdirSync(path.join(app.temp, 'degrees.json'));
    result = await input(alice, 3, { type: 'sync', frame: state.world.frame, active: true }); assert.equal(result.status, 400);
    fs.rmdirSync(path.join(app.temp, 'degrees.json'));
    fs.mkdirSync(path.join(app.temp, 'trophies.json'));
    result = await input(alice, 3, { type: 'sync', frame: state.world.frame, active: true }); assert.equal(result.status, 400);
    fs.rmdirSync(path.join(app.temp, 'trophies.json'));
    result = await input(alice, 3, { type: 'sync', frame: state.world.frame, active: true }); assert.equal(result.data.ok, true);
    const syncRetry = await input(alice, 3, { type: 'sync', frame: state.world.frame, active: true }); assert.equal(syncRetry.data.retry, true);
    assert.equal((await input(alice, 4, { type: 'sync', frame: state.world.frame, active: true })).status, 400);
    assert.equal((await input(alice, 4, { type: 'sync', frame: 99999999, active: true })).status, 400);
    await wait(300); time += 3; state = (await app.api('/multiplayer/state', undefined, '', alice.token)).data;
    await input(alice, 4, { type: 'sync', frame: state.world.frame, active: true });
    let home = (await app.api('', undefined, a.cookie)).data;
    assert.equal(home.degrees.balance, 100); assert.equal(home.degrees.gameplay_seconds, 3); assert.equal(home.trophies.granted.length, 1);
    await wait(300); time += 3; state = (await app.api('/multiplayer/state', undefined, '', alice.token)).data;
    await input(alice, 5, { type: 'sync', frame: state.world.frame, active: false });
    time += 120; const previousToken = alice.token; alice = await app.join(a.cookie); assert.equal(alice.next_seq, 6);
    assert.equal((await app.api('/multiplayer/state', undefined, '', previousToken)).status, 400, 'Reconnect revokes the old client.');
    assert.equal((await app.api('/multiplayer/state', undefined, '', bob.token)).status, 200);
    await wait(300); state = (await app.api('/multiplayer/state', undefined, '', alice.token)).data;
    await input(alice, 6, { type: 'sync', frame: state.world.frame, active: true });
    home = (await app.api('', undefined, a.cookie)).data; assert.equal(home.degrees.gameplay_seconds, 3, 'Disconnected time is excluded.');
    // A forged local report cannot drive a server-tagged ledger session.
    const journal = M.readJSON(path.join(app.temp, 'multiplayer.json'));
    const ledger = M.readJSON(path.join(app.temp, 'degrees.json'));
    const member = journal.members[alice.profile_id];
    assert.equal(D.observe(ledger, { profile: { id: alice.profile_id }, generated_unix: time, session: { id: member.session_id, started_unix: member.started_unix, active_seconds: 99 } }, time), false);
    await app.restart(); alice = await app.join(a.cookie); assert.equal(alice.next_seq, 7);
    state = (await app.api('/multiplayer/state', undefined, '', alice.token)).data; assert.equal(state.world.camps.length, 2); assert.equal(state.world.camps[0].nerve_center_online, true);
    home = (await app.api('', undefined, a.cookie)).data; assert.equal(home.degrees.balance, 100); assert.equal(home.degrees.gameplay_seconds, 3); assert.equal(home.trophies.granted.length, 1);
    // A second surviving NC under the same registered owner uses the existing two-camp rule.
    assert.equal((await input(alice, 7, { ...claim, camp: 737 })).data.ok, true);
    assert.equal((await input(alice, 8, { type: 'build', camp: 737, kind: 'nc', x: 10, z: 33 })).data.ok, true);
    await wait(3500); await app.api('/multiplayer/state', undefined, '', alice.token);
    home = (await app.api('', undefined, a.cookie)).data;
    assert.equal(home.trophies.granted.length, 2); assert.deepEqual(home.trophies.granted.map(t => t.id), ['visitor-first-claim', 'visitor-two-camps']);
    await app.api('/multiplayer/state', undefined, '', alice.token);
    assert.equal((await app.api('', undefined, a.cookie)).data.trophies.granted.length, 2);
    const expiredAdmission = await app.api('/multiplayer/admission', {}, a.cookie);
    time += 31;
    assert.equal((await app.api('/multiplayer/connect', { ticket: expiredAdmission.data.ticket })).status, 400);
    time += 86400; alice = await app.join(a.cookie);
    state = (await app.api('/multiplayer/state', undefined, '', alice.token)).data;
    assert.equal((await input(alice, 9, { type: 'sync', frame: state.world.frame, active: true })).data.ok, true);
    home = (await app.api('', undefined, a.cookie)).data;
    assert.equal(home.degrees.balance, 200); assert.equal(home.degrees.attendance_days, 2); assert.equal(home.degrees.gameplay_seconds, 3);
    assert.equal(home.trophies.granted.length, 2, 'A new launch date does not duplicate camp awards.');
    await app.api('/auth/logout', {}, a.cookie);
    assert.equal((await app.api('/multiplayer/state', undefined, '', alice.token)).status, 400);
  } finally { await app.close(); assert.deepEqual(hashes(), original, 'Real balances, awards and local saves stay unchanged.'); }
});

test('two actual native Godot clients share construction/mining and both earn existing awards', { skip: !available, timeout: 45000 }, async () => {
  const original = hashes(), app = await setup(); const children = [];
  try {
    const accounts = [await app.account('native_alpha'), await app.account('native_beta')];
    const tickets = [];
    for (const account of accounts) tickets.push((await app.api('/multiplayer/admission', {}, account.cookie)).data.ticket);
    const runs = tickets.map((ticket, index) => new Promise((resolve, reject) => {
      const output = path.join(app.temp, `native-${index}.json`);
      const child = spawn(runtime, ['--headless', '--path', path.join(gameRoot, 'playable'), '--script', 'tests/run_shared_e2e.gd', '--',
        '--shared-url=' + app.base, '--shared-ticket=' + ticket, '--test-camp=' + (735 + index), '--test-output=' + output], { windowsHide: true });
      children.push(child); let log = ''; child.stdout.on('data', c => { log += c; }); child.stderr.on('data', c => { log += c; process.stderr.write(c); });
      child.on('error', reject); child.on('close', code => { try { assert.equal(code, 0, log); assert.match(log, /SHARED_NATIVE_E2E_OK/); assert.doesNotMatch(log, /SCRIPT ERROR:|Parse Error:/); resolve(JSON.parse(fs.readFileSync(output))); } catch (error) { reject(error); } });
    }));
    const results = await Promise.all(runs);
    assert.notEqual(results[0].profile_id, results[1].profile_id);
    for (let index = 0; index < 2; index++) {
      const world = results[index].world; assert.equal(world.world_id, 'visitor-loopback-v1'); assert.equal(world.camps.length, 2);
      assert.ok(world.camps.every(c => c.nerve_center_online)); assert.ok(world.camps.find(c => c.owner_id === results[index].profile_id).mined > 0);
      const home = (await app.api('', undefined, accounts[index].cookie)).data;
      assert.equal(home.degrees.balance, 100); assert.ok(home.degrees.gameplay_seconds >= 4); assert.equal(home.trophies.granted.length, 1);
    }
  } finally { for (const child of children) if (child.exitCode === null) child.kill(); await app.close(); assert.deepEqual(hashes(), original); }
});

test('server adapter reuses hourly/attendance rules and rejects regressing receipt counters', () => {
  const ledger = D.newLedger(), id = 'local-' + '1'.repeat(32), session = 'session-' + '2'.repeat(32), start = 1780000000;
  D.beginSession(ledger, session, id, start); ledger.sessions[session].authority = '10six-server-v1';
  const evidence = { authority: '10six-server-v1', profile_id: id, session_id: session, started_unix: start, active_seconds: 3600, generated_unix: start + 3600 };
  assert.equal(D.observeServer(ledger, evidence, start + 3600), true);
  assert.equal(D.view(ledger, id, start + 3600).balance, 350);
  D.observeServer(ledger, evidence, start + 3600); assert.equal(D.view(ledger, id, start + 3600).balance, 350);
  assert.equal(D.observeServer(ledger, { ...evidence, active_seconds: 3599 }, start + 3600), false);
  assert.equal(D.observeServer(ledger, { ...evidence, authority: 'local_reconstruction' }, start + 3600), false);
});

test('shared launch retries retain one native window, reopen after exit and contain spawn errors', { skip: !available }, async () => {
  const launches = [], app = await setup(undefined, { spawnGame(executable, args, options) {
    const child = new EventEmitter(); launches.push({ child, args, options }); return child;
  } });
  try {
    const account = await app.account('launch_guard');
    let result = await app.api('/multiplayer/launch', {}, account.cookie); assert.equal(result.status, 200);
    assert.equal(launches.length, 1); assert.equal(launches[0].options.windowsHide, false);
    assert.ok(launches[0].args.includes('scripts/multiplayer_client.gd'));
    result = await app.api('/multiplayer/launch', {}, account.cookie); assert.equal(result.status, 200); assert.equal(launches.length, 1);
    assert.equal((await app.api('', undefined, account.cookie)).data.launch.any_running, true);
    assert.equal((await app.api('', undefined, account.cookie)).data.degrees.balance, 0);
    launches[0].child.emit('exit', 0);
    await app.api('/multiplayer/launch', {}, account.cookie); assert.equal(launches.length, 2);
    launches[1].child.emit('error', new Error('isolated spawn failure'));
    const home = (await app.api('', undefined, account.cookie)).data;
    assert.equal(home.launch.any_running, false); assert.match(home.launch.error, /could not open/); assert.equal(home.degrees.balance, 0);
  } finally { await app.close(); }
});

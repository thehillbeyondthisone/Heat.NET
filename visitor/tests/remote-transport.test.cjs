'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const https = require('node:https');
const { fork, spawn } = require('node:child_process');
const { createFixtures, available: cryptoAvailable } = require('./remote-tls-fixtures.cjs');
const { createRemoteAuthority } = require('../authority-client.cjs');
const { createVisitorServer } = require('../server.cjs');
const C = require('../authority-contract.cjs');
const root = path.resolve(__dirname, '../..'), gameRoot = path.resolve(root, '../..');
const runtime = path.join(gameRoot, 'recovery/runtime/Godot.exe');
// Optional explicit test package lets the same flow verify the two extracted source roles together.
const hostGameRoot = process.env.HEAT_TEST_HOST_BUNDLE ? path.join(path.resolve(process.env.HEAT_TEST_HOST_BUNDLE), 'game') : gameRoot;
const hostChild = process.env.HEAT_TEST_HOST_BUNDLE ? path.join(hostGameRoot, 'integration-workspaces/heat-net/visitor/tests/remote-authority-child.cjs') : path.join(__dirname, 'remote-authority-child.cjs');
const available = cryptoAvailable && fs.existsSync(runtime) && fs.existsSync(hostChild) && fs.existsSync(path.join(hostGameRoot, 'recovery/runtime/Godot.exe'));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const normal = ['saves/first-plot.json', 'saves/first-plot.json.bak', 'saves/heat-net/degrees.json', 'saves/heat-net/trophies.json'].map(file => path.join(gameRoot, file));
const hashes = () => normal.map(file => fs.existsSync(file) ? crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') : null);
async function environment() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'heat-secure-transport-'));
  const fixtures = createFixtures(path.join(temp, 'tls'));
  const hostState = path.join(temp, 'game-authority'), toastState = path.join(temp, 'heat-owner');
  const configFile = path.join(temp, 'host-test.json');
  fs.writeFileSync(configFile, JSON.stringify({ gameRoot: hostGameRoot, stateDir: hostState, worldId: 'isolated-secure-world', toastSpki: fixtures.toastSpki,
    ca: path.join(fixtures.directory, 'ca.pem'), cert: path.join(fixtures.directory, 'server.pem'), key: path.join(fixtures.directory, 'server.key') }));
  let child, config, bridge, base, lastLog = '', dropOnce = false, dropped = false;
  async function startHost() {
    child = fork(hostChild, [configFile], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
    child.stderr.on('data', chunk => { lastLog = (lastLog + chunk).slice(-2000); });
    const port = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Isolated authority host did not start. ' + lastLog)), 10000);
      child.once('error', reject); child.once('exit', code => { if (code !== 0) reject(new Error('Authority child exited: ' + lastLog)); });
      child.once('message', message => { clearTimeout(timer); resolve(message.port); });
    });
    config = { endpoint: `https://127.0.0.1:${port}`, world_id: 'isolated-secure-world', server_spki: fixtures.serverSpki,
      ca: fixtures.ca, cert: fixtures.toast.cert, key: fixtures.toast.key };
  }
  async function stopHost() {
    if (!child || child.exitCode !== null) return;
    await new Promise(resolve => { const timer = setTimeout(() => { child.kill(); resolve(); }, 5000); child.once('exit', () => { clearTimeout(timer); resolve(); }); child.send('close'); });
  }
  function factory() {
    const authority = createRemoteAuthority(config), execute = authority.execute;
    authority.execute = async input => { const receipt = await execute(input); if (dropOnce && !dropped && input.action.type === 'build') { dropped = true; throw new Error('Isolated loss after remote commit'); } return receipt; };
    return authority;
  }
  async function startToast() {
    bridge = createVisitorServer({ root, stateDir: toastState, gameRoot, remoteAuthority: config, authorityFactory: factory });
    await new Promise(resolve => bridge.server.listen(0, '127.0.0.1', resolve)); base = `http://127.0.0.1:${bridge.server.address().port}`;
  }
  await startHost(); await startToast();
  async function api(route, data, cookie = '', token = '') {
    const res = await fetch(base + '/api/visitor' + route, { method: data === undefined ? 'GET' : 'POST', headers: { Origin: base, Cookie: cookie, 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: data === undefined ? undefined : JSON.stringify(data) });
    return { status: res.status, data: await res.json(), cookie: (res.headers.get('set-cookie') || '').split(';')[0] };
  }
  const account = async name => { const result = await api('/auth/register', { username: name, display_name: name, password: crypto.randomBytes(24).toString('hex') }); assert.equal(result.status, 200); return result; };
  const ticket = async cookie => { const result = await api('/multiplayer/admission', {}, cookie); assert.equal(result.status, 200); return result.data.ticket; };
  const join = async cookie => { const result = await api('/multiplayer/connect', { ticket: await ticket(cookie) }); assert.equal(result.status, 200, JSON.stringify(result.data)); return result.data; };
  return { temp, fixtures, hostState, toastState, api, account, ticket, join, get base() { return base; }, get config() { return config; },
    loseNextBuildReply() { dropOnce = true; },
    async restartToast() { await new Promise(resolve => bridge.server.close(resolve)); await startToast(); },
    async restartBoth() { await new Promise(resolve => bridge.server.close(resolve)); await stopHost(); await startHost(); await startToast(); },
    async close() { if (bridge?.server.listening) await new Promise(resolve => bridge.server.close(resolve)); await stopHost();
      const safe = fs.realpathSync(temp); assert.ok(safe.startsWith(fs.realpathSync(os.tmpdir()) + path.sep)); fs.rmSync(safe, { recursive: true, force: true }); } };
}
function rawRequest(config, payload, credentials = config, options = {}) {
  const body = JSON.stringify(payload);
  return new Promise((resolve, reject) => {
    const req = https.request(new URL('/v1/authority', config.endpoint), { method: 'POST', ca: config.ca, cert: credentials.cert, key: credentials.key,
      minVersion: 'TLSv1.3', maxVersion: 'TLSv1.3', agent: false, ...options, headers: { 'Content-Type': 'application/json' } }, res => {
      let text = ''; res.on('data', chunk => { text += chunk; }); res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(text), tls: res.socket?.getProtocol() }));
    }); req.on('error', reject); req.end(body);
  });
}
test('TLS requires explicit trust, mutual authentication and pinned server/client identities', { skip: !available, timeout: 60000 }, async () => {
  const app = await environment();
  try {
    assert.throws(() => createRemoteAuthority({ ...app.config, endpoint: 'http://127.0.0.1:10661' }), /HTTPS/);
    assert.throws(() => createRemoteAuthority({ ...app.config, key: null }), /Incomplete/);
    const wrongPin = createRemoteAuthority({ ...app.config, server_spki: '0'.repeat(64) });
    await assert.rejects(wrongPin.start(), /pin mismatch/); wrongPin.close();
    const packet = { protocol: C.PROTOCOL, request_id: crypto.randomBytes(32).toString('hex'), operation: 'snapshot', payload: { world_id: app.config.world_id } };
    await assert.rejects(rawRequest(app.config, packet, {}));
    const rogue = await rawRequest(app.config, packet, app.fixtures.rogue); assert.equal(rogue.status, 400); assert.match(rogue.data.error, /certificate/);
    await assert.rejects(rawRequest(app.config, packet, app.config, { servername: 'incorrect.example' }));
    await assert.rejects(rawRequest(app.config, packet, app.config, { maxVersion: 'TLSv1.2', minVersion: 'TLSv1.2' }));
    const valid = await rawRequest(app.config, packet); assert.equal(valid.status, 200); assert.equal(valid.data.result.world.world_id, app.config.world_id);
    const wrongWorld = await rawRequest(app.config, { ...packet, payload: { world_id: 'invented-world' } }); assert.equal(wrongWorld.status, 400);
    assert.equal(fs.existsSync(path.join(app.hostState, 'accounts.json')), false); assert.equal(fs.existsSync(path.join(app.hostState, 'degrees.json')), false);
  } finally { await app.close(); }
});

test('remote host commits once across lost replies, reconnects and both-process restarts; only HEAT owns awards', { skip: !available, timeout: 60000 }, async () => {
  const original = hashes(), app = await environment();
  try {
    const a = await app.account('shared_alpha'), b = await app.account('shared_beta');
    let alice = await app.join(a.cookie), bob = await app.join(b.cookie);
    const input = (client, seq, action) => app.api('/multiplayer/input', { seq, action }, '', client.token);
    const claim = { type: 'claim', camp: 735, corporation: 'bruteforce' };
    assert.equal((await input(alice, 1, claim)).data.ok, true);
    assert.equal((await input(alice, 1, claim)).data.retry, true);
    assert.equal((await input(bob, 1, { ...claim, camp: 736 })).data.ok, true);
    const forbidden = await input(bob, 2, { type: 'build', camp: 735, kind: 'nc', x: 10, z: 33 }); assert.equal(forbidden.data.ok, false); assert.match(forbidden.data.error, /owner/);
    app.loseNextBuildReply();
    const build = { type: 'build', camp: 735, kind: 'nc', x: 10, z: 33 };
    assert.equal((await input(alice, 2, build)).status, 400);
    const pending = JSON.parse(fs.readFileSync(path.join(app.toastState, 'multiplayer-remote.json'))).members[alice.profile_id]; assert.equal(pending.pending.seq, 2);
    await app.restartToast(); alice = await app.join(a.cookie);
    assert.equal(alice.next_seq, 3, 'Reconnect reconciles the already committed remote intent.');
    assert.equal(alice.world.camps[0].entities.filter(e => e.kind === 'nc').length, 1);
    await pause(3500);
    let state = (await app.api('/multiplayer/state', undefined, '', alice.token)).data;
    assert.equal(state.world.camps[0].nerve_center_online, true);
    assert.equal((await input(alice, 3, { type: 'sync', frame: state.world.frame, active: true })).status, 200);
    await pause(350); state = (await app.api('/multiplayer/state', undefined, '', alice.token)).data;
    assert.equal((await input(alice, 4, { type: 'sync', frame: state.world.frame, active: true })).status, 200);
    let home = (await app.api('', undefined, a.cookie)).data; assert.equal(home.degrees.balance, 100); assert.ok(home.degrees.gameplay_seconds > 0); assert.equal(home.trophies.granted.length, 1);
    const seconds = home.degrees.gameplay_seconds;
    const hostState = JSON.parse(fs.readFileSync(path.join(app.hostState, 'authority-world.json')));
    const journal = JSON.parse(fs.readFileSync(path.join(app.toastState, 'multiplayer-remote.json')));
    const member = journal.members[alice.profile_id], adapter = createRemoteAuthority(app.config);
    assert.deepEqual(journal.checkpoint, {}, 'The authoritative world is stored only on the game host.');
    assert.equal(hostState.sessions[member.session_id].active_seconds, seconds);
    await assert.rejects(adapter.execute({ profile_id: alice.profile_id, session_id: member.session_id, generation: member.remote_generation, seq: 4, action: { type: 'claim', camp: 737, corporation: 'bruteforce' } }), /Replayed|conflicting/);
    await assert.rejects(adapter.admit({ profile_id: alice.profile_id, session_id: member.session_id, generation: crypto.randomBytes(32).toString('hex'), admission_seq: 1, next_seq: 5 }), /Replayed|generation|out-of-order/);
    await assert.rejects(adapter.execute({ profile_id: alice.profile_id, session_id: member.session_id, generation: member.remote_generation, seq: 5, action: { type: 'sync', frame: 999999, active: true } }), /forged/);
    await assert.rejects(adapter.execute({ profile_id: alice.profile_id, session_id: member.session_id, generation: member.remote_generation, seq: 5, action: { type: 'sync', frame: state.world.frame, active: true, client_time: 9999 } }), /intents/);
    adapter.close();
    await app.restartBoth(); alice = await app.join(a.cookie); assert.equal(alice.next_seq, 5); assert.equal(alice.world.camps.length, 2); assert.equal(alice.world.camps[0].nerve_center_online, true);
    state = (await app.api('/multiplayer/state', undefined, '', alice.token)).data;
    await input(alice, 5, { type: 'sync', frame: state.world.frame, active: true });
    home = (await app.api('', undefined, a.cookie)).data; assert.equal(home.degrees.balance, 100); assert.equal(home.degrees.gameplay_seconds, seconds); assert.equal(home.trophies.granted.length, 1);
    await app.api('/auth/logout', {}, a.cookie); assert.equal((await app.api('/multiplayer/state', undefined, '', alice.token)).status, 400);
    for (const file of ['accounts.json', 'degrees.json', 'trophies.json', 'identity.json']) assert.equal(fs.existsSync(path.join(app.hostState, file)), false);
  } finally { await app.close(); assert.deepEqual(hashes(), original); }
});

test('two native clients use Toast identity and remote Godot gameplay over the authenticated encrypted service link', { skip: !available, timeout: 60000 }, async () => {
  const original = hashes(), app = await environment(), children = [];
  try {
    const accounts = [await app.account('native_alpha'), await app.account('native_beta')], tickets = [];
    for (const account of accounts) tickets.push(await app.ticket(account.cookie));
    const results = await Promise.all(tickets.map((ticket, index) => new Promise((resolve, reject) => {
      const output = path.join(app.temp, `native-${index}.json`);
      const child = spawn(runtime, ['--headless', '--path', path.join(gameRoot, 'playable'), '--script', 'tests/run_shared_e2e.gd', '--',
        '--shared-url=' + app.base, '--shared-ticket=' + ticket, '--test-camp=' + (735 + index), '--test-output=' + output], { windowsHide: true });
      children.push(child); let log = ''; child.stdout.on('data', chunk => { log += chunk; }); child.stderr.on('data', chunk => { log += chunk; }); child.on('error', reject);
      child.on('close', code => { try { assert.equal(code, 0, log); assert.match(log, /SHARED_NATIVE_E2E_OK/); assert.doesNotMatch(log, /SCRIPT ERROR:|Parse Error:/); resolve(JSON.parse(fs.readFileSync(output))); } catch (error) { reject(error); } });
    })));
    for (let index = 0; index < 2; index++) {
      assert.equal(results[index].world.world_id, 'isolated-secure-world'); assert.equal(results[index].world.camps.length, 2); assert.ok(results[index].world.camps.every(camp => camp.nerve_center_online));
      assert.ok(results[index].world.camps.find(camp => camp.owner_id === results[index].profile_id).mined > 0);
      const home = (await app.api('', undefined, accounts[index].cookie)).data; assert.equal(home.degrees.balance, 100); assert.equal(home.trophies.granted.length, 1); assert.ok(home.degrees.gameplay_seconds >= 4);
    }
  } finally { for (const child of children) if (child.exitCode === null) child.kill(); await app.close(); assert.deepEqual(hashes(), original); }
});

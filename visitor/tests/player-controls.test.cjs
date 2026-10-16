'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
const https = require('node:https');
const { spawn } = require('node:child_process');
const { EventEmitter } = require('node:events');
const net = require('node:net');
const { createFixtures, available: tlsAvailable } = require('./remote-tls-fixtures.cjs');
const hostGameRoot = process.env.HEAT_TEST_HOST_BUNDLE ? path.join(path.resolve(process.env.HEAT_TEST_HOST_BUNDLE), 'game') : path.resolve(__dirname, '../../../..');
const hostVisitor = path.join(hostGameRoot, 'integration-workspaces/heat-net/visitor');
const { createAuthorityHost } = require(path.join(hostVisitor, 'authority-host.cjs'));
const { createRemoteAuthority } = require('../authority-client.cjs');
const { createVisitorServer } = require('../server.cjs');
const { createPlayerGateway } = require('../player-gateway.cjs');
const { createPlayerLink } = require('../player-link.cjs');
const { createPlayerBridge } = require('../player-bridge.cjs');
const { createDesktopControls } = require('../desktop-controls.cjs');
const Config = require('../controls-config.cjs');
const { acquire } = require('../desktop-state.cjs');
const root = path.resolve(__dirname, '../..'), gameRoot = path.resolve(root, '../..');
const runtime = path.join(gameRoot, 'recovery/runtime/Godot.exe'), available = tlsAvailable && fs.existsSync(runtime);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const savePaths = ['saves/first-plot.json', 'saves/first-plot.json.bak', 'saves/heat-net/degrees.json', 'saves/heat-net/trophies.json'].map(file => path.join(gameRoot, file));
const hashes = () => savePaths.map(file => fs.existsSync(file) ? crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') : null);
async function environment(clock) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'heat-player-controls-')), fixtures = createFixtures(path.join(temp, 'tls'));
  const state = path.join(temp, 'heat'), hostState = path.join(temp, 'world'); const worldId = 'isolated-player-world';
  const host = createAuthorityHost({ gameRoot: hostGameRoot, stateDir: hostState, worldId, toastSpki: fixtures.toastSpki, tls: { ca: fixtures.ca, ...fixtures.server }, ...(clock ? { now: clock } : {}) });
  await new Promise(resolve => host.server.listen(0, '127.0.0.1', resolve));
  const remote = { endpoint: 'https://127.0.0.1:' + host.server.address().port, world_id: worldId, server_spki: fixtures.serverSpki, ca: fixtures.ca, ...fixtures.toast };
  let loseReply = false;
  const bridge = createVisitorServer({ root, gameRoot, stateDir: state, remoteAuthority: remote, ...(clock ? { now: clock } : {}), authorityFactory() {
    const authority = createRemoteAuthority(remote), execute = authority.execute;
    authority.execute = async input => { const value = await execute(input); if (loseReply && input.action.type === 'build') { loseReply = false; throw new Error('Test reply lost after commit'); } return value; }; return authority;
  } });
  await new Promise(resolve => bridge.server.listen(0, '127.0.0.1', resolve)); const base = 'http://127.0.0.1:' + bridge.server.address().port;
  const connections = [], playerRequest = bridge.playerRequest; bridge.playerRequest = async (...args) => { const value = await playerRequest(...args); if (args[2] === 'connect') connections.push({ token: value.token, profile_id: value.profile_id }); return value; };
  const gateway = createPlayerGateway({ bridge, worldId, tls: fixtures.player }); await new Promise(resolve => gateway.server.listen(0, '127.0.0.1', resolve));
  const trust = { endpoint: 'https://127.0.0.1:' + gateway.server.address().port, world_id: worldId, server_spki: fixtures.playerSpki, ca: fixtures.ca };
  const links = [], natives = [];
  async function account(name) { const password = crypto.randomBytes(24).toString('hex'); const response = await fetch(base + '/api/visitor/auth/register', {
    method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ username: name, display_name: name, password }) }); assert.equal(response.status, 200); return { username: name, password }; }
  function link(config = trust) { const result = createPlayerLink(config); links.push(result); return result; }
  async function native() { const result = createPlayerBridge({ trust, ...(clock ? { now: clock } : {}) }); natives.push(result); await new Promise(resolve => result.server.listen(0, '127.0.0.1', resolve)); return result; }
  const playerFile = path.join(temp, 'public-player.json'); fs.writeFileSync(playerFile, JSON.stringify({ endpoint: trust.endpoint, world_id: worldId, server_spki: trust.server_spki, ca_file: path.join(fixtures.directory, 'ca.pem') }));
  return { temp, state, hostState, fixtures, trust, remote, account, link, native, playerFile, connections, loseReply() { loseReply = true; },
    async close() { for (const native of natives) await native.close(); for (const link of links) link.close(); await gateway.close(); await new Promise(resolve => bridge.server.close(resolve)); await host.close();
      const safe = fs.realpathSync(temp); assert.ok(safe.startsWith(fs.realpathSync(os.tmpdir()) + path.sep)); fs.rmSync(safe, { recursive: true, force: true }); } };
}
function raw(app, operation, data = {}, options = {}) {
  const requestId = crypto.randomBytes(32).toString('hex');
  const body = JSON.stringify({ world_id: app.trust.world_id, request_id: requestId, data, ...options.envelope });
  return new Promise((resolve, reject) => { const req = https.request(new URL('/api/player/v1/' + operation, app.trust.endpoint), { ca: app.fixtures.ca, agent: false,
    method: 'POST', minVersion: 'TLSv1.3', ...options.tls, headers: { 'Content-Type': 'application/json', ...options.headers } }, res => {
      let text = ''; res.on('data', chunk => text += chunk); res.on('end', () => resolve({ status: res.statusCode, value: JSON.parse(text), headers: res.headers }));
    }); req.on('error', reject); req.end(body); });
}
async function local(native, operation, data, token, headers = {}) {
  const res = await fetch('http://127.0.0.1:' + native.server.address().port + '/api/visitor/multiplayer/' + operation, {
    method: data === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...headers }, body: data === undefined ? undefined : JSON.stringify(data) });
  return { status: res.status, value: await res.json() };
}
test('players use public TLS trust and existing HEAT sessions; world/identity/replay/expiry/revocation bind every action', { skip: !available, timeout: 60000 }, async () => {
  const original = hashes(); let time = 1791580000; const app = await environment(() => time);
  try {
    assert.throws(() => app.link({ ...app.trust, key: app.fixtures.toast.key }), /public trust/);
    assert.throws(() => app.link({ ...app.trust, endpoint: 'http://127.0.0.1:10663' }), /secure player/);
    await assert.rejects(app.link({ ...app.trust, server_spki: '0'.repeat(64) }).call('health'), /pin mismatch/);
    await assert.rejects(app.link({ ...app.trust, ca: app.fixtures.toast.cert }).call('health'));
    await assert.rejects(raw(app, 'health', {}, { tls: { servername: 'incorrect.example' } }));
    await assert.rejects(raw(app, 'health', {}, { tls: { minVersion: 'TLSv1.2', maxVersion: 'TLSv1.2' } }));
    assert.equal((await raw(app, 'health', {}, { envelope: { world_id: 'wrong-world' } })).status, 400);
    assert.equal((await raw(app, 'health', {}, { headers: { Origin: 'https://foreign.example' } })).status, 400);
    assert.equal((await raw(app, 'health', { extra: true })).status, 400);
    assert.equal((await raw(app, 'summary')).status, 401);
    const a = await app.account('player_alpha'), b = await app.account('player_beta'), alice = app.link(), bob = app.link();
    const cookie = await raw(app, 'login', a); assert.equal(cookie.status, 200); assert.match(cookie.headers['set-cookie'][0], /; Secure/); assert.match(cookie.headers['set-cookie'][0], /HttpOnly/);
    await alice.call('login', a); await bob.call('login', b); assert.equal((await alice.call('health')).ready, true);
    const ticket = await alice.call('admission'); await assert.rejects(bob.call('connect', { ticket: ticket.ticket }), /another HEAT session/);
    const joined = await alice.call('connect', { ticket: ticket.ticket }); await assert.rejects(alice.call('connect', { ticket: ticket.ticket }), /already used/);
    await assert.rejects(bob.call('state', {}, joined.token), /Sign in/);
    const claim = { seq: 1, action: { type: 'claim', camp: 735, corporation: 'bruteforce' } };
    assert.equal((await alice.call('input', claim, joined.token)).ok, true);
    assert.equal((await alice.call('input', claim, joined.token)).retry, true);
    await assert.rejects(alice.call('input', { ...claim, action: { ...claim.action, camp: 736 } }, joined.token), /conflicting/);
    await assert.rejects(alice.call('input', { seq: 2, action: { type: 'report', awards: ['visitor-two-camps'], active_seconds: 90000 } }, joined.token), /game intents/);
    app.loseReply(); const build = { seq: 2, action: { type: 'build', camp: 735, kind: 'nc', x: 10, z: 33 } };
    await assert.rejects(alice.call('input', build, joined.token), error => error.playerStatus === 503);
    const reconciled = await alice.call('input', build, joined.token); assert.equal(reconciled.ok, true); assert.equal(reconciled.world.camps[0].entities.length, 1);
    assert.equal((await alice.call('input', build, joined.token)).retry, true);
    const fresh = await alice.call('connect', { ticket: (await alice.call('admission')).ticket }); assert.equal(fresh.next_seq, 3);
    await assert.rejects(alice.call('state', {}, joined.token), /reconnect/);
    const delayed = await bob.call('admission'); time += 31; await assert.rejects(bob.call('connect', { ticket: delayed.ticket }), /expired/);
    time += 900; await assert.rejects(alice.call('state', {}, fresh.token), /reconnect/);
    const rejoin = await alice.call('connect', { ticket: (await alice.call('admission')).ticket }); assert.equal(rejoin.world.camps[0].entities.length, 1);
    await alice.call('logout'); await assert.rejects(alice.call('state', {}, rejoin.token), /Sign in/); assert.equal(alice.signedIn, false);
    const native = await app.native(); await native.link.call('login', b); const expired = await native.admission(); time += 31;
    assert.equal((await local(native, 'connect', { ticket: expired })).status, 400);
    const localTicket = await native.admission(); assert.equal((await local(native, 'connect', { ticket: localTicket }, '', { Origin: 'http://foreign.example' })).status, 400);
    const connected = await local(native, 'connect', { ticket: localTicket }); assert.equal(connected.status, 200);
    assert.equal((await local(native, 'connect', { ticket: localTicket })).status, 400);
    await native.stopGame(); assert.equal((await local(native, 'state', undefined, connected.value.token)).status, 400);
    time += 7 * 86400; await assert.rejects(bob.call('summary'), /Sign in/);
    for (const file of ['accounts.json', 'degrees.json', 'trophies.json']) assert.equal(fs.existsSync(path.join(app.hostState, file)), false);
  } finally { await app.close(); assert.deepEqual(hashes(), original); }
});
test('two real native clients pass through separate player bridges, TLS gateway and mTLS authority; server participation awards once', { skip: !available, timeout: 60000 }, async () => {
  const original = hashes(), app = await environment(), children = [];
  try {
    const accounts = [await app.account('native_player_alpha'), await app.account('native_player_beta')], natives = [await app.native(), await app.native()];
    const results = await Promise.all(natives.map(async (native, index) => {
      await native.link.call('login', accounts[index]); const ticket = await native.admission(), output = path.join(app.temp, 'native-' + index + '.json'); const finishMarker=path.join(app.temp,'native-'+index+'.finish');
      return new Promise((resolve, reject) => {
        const child = spawn(runtime, ['--headless', '--path', path.join(gameRoot, 'playable'), '--script', 'tests/run_shared_e2e.gd', '--', '--shared-url=http://127.0.0.1:' + native.server.address().port,
          '--shared-ticket=' + ticket, '--test-camp=' + (735 + index), '--test-output=' + output, '--test-finish-marker='+finishMarker], { windowsHide: true }); children.push(child);
        // Finish only after the actual server ledger observed four seconds. Startup/build
        // wall time does not guarantee paired participation acknowledgements.
        (async()=>{while(child.exitCode===null){const home=await native.link.call('summary');if(home.degrees.gameplay_seconds>=4){fs.writeFileSync(finishMarker,'server-observed');return;}await pause(500);}})().catch(reject);
        let log = ''; child.stdout.on('data', chunk => log += chunk); child.stderr.on('data', chunk => log += chunk); child.once('error', reject);
        child.once('close', code => { try { assert.equal(code, 0, log); assert.match(log, /SHARED_NATIVE_E2E_OK/); assert.doesNotMatch(log, /SCRIPT ERROR:|Parse Error:/); resolve(JSON.parse(fs.readFileSync(output))); } catch (error) { reject(error); } });
      });
    }));
    for (let index = 0; index < 2; index++) {
      assert.equal(results[index].world.world_id, app.trust.world_id); assert.equal(results[index].world.camps.length, 2); assert.ok(results[index].world.camps.every(camp => camp.nerve_center_online));
      assert.ok(results[index].world.camps.find(camp => camp.owner_id === results[index].profile_id).mined > 0);
      const first = await natives[index].link.call('summary'), retry = await natives[index].link.call('summary'); assert.equal(first.degrees.balance, 100); assert.ok(first.degrees.gameplay_seconds >= 4);
      assert.equal(first.trophies.granted.length, 1); assert.deepEqual(first, retry);
      const rejoin = await natives[index].link.call('connect', { ticket: (await natives[index].link.call('admission')).ticket }); assert.equal(rejoin.profile_id, results[index].profile_id);
      assert.equal((await natives[index].link.call('summary')).degrees.balance, 100);
    }
  } finally { for (const child of children) if (child.exitCode === null) child.kill(); await app.close(); assert.deepEqual(hashes(), original); }
});
test('desktop commands validate public-only setup and contain failed/duplicate launches and owned-process shutdown', { skip: !available, timeout: 60000 }, async () => {
  const app = await environment(); let controls;
  try {
    const setup = path.join(app.temp, 'controls.json'), rawSetup = { version: 1, role: 'player', network_approved: false, game_root: gameRoot, player_config_file: app.playerFile, service_config_file: '' };
    fs.writeFileSync(setup, JSON.stringify(rawSetup)); const config = Config.loadControlsConfig(setup); assert.deepEqual(Object.keys(Config.loadPlayerConfig(app.playerFile)).sort(), ['ca', 'endpoint', 'server_spki', 'world_id']);
    fs.writeFileSync(setup, JSON.stringify({ ...rawSetup, service_config_file: 'C:/broker-secret.json' })); assert.throws(() => Config.loadControlsConfig(setup), /no trusted service/);
    const unsafe = path.join(app.temp, 'listener.json'); fs.writeFileSync(unsafe, JSON.stringify({ bind: '192.168.1.68', port: 10663, world_id: app.trust.world_id, cert_file: 'C:/not-read.pem', key_file: 'C:/not-read.key' }));
    assert.throws(() => Config.loadListenerConfig(unsafe, false), /not been approved/);
    const account = await app.account('desktop_player'), children = []; let fail = true;
    controls = createDesktopControls(config, { spawnGame() { if (fail) throw new Error('Test failed spawn'); const child = new EventEmitter(); child.kill = () => { child.killed = true; child.emit('exit', 0); }; children.push(child); return child; } });
    await assert.rejects(controls.command('start'), /player only/); await assert.rejects(controls.command('play'), /Sign in/);
    assert.equal((await controls.command('login', account)).signed_in, true); assert.equal((await controls.command('check')).ok, true);
    await assert.rejects(controls.command('play'), /failed spawn/); await assert.rejects(controls.command('play'), /failed spawn/);
    fail = false; assert.equal((await controls.command('play')).game_running, true); await controls.command('play'); assert.equal(children.length, 1);
    await controls.command('stopgame'); assert.equal(children[0].killed, true); assert.equal((await controls.command('status')).game_running, false);
    await controls.command('play'); children[1].emit('error', new Error('async launch failure')); await pause(20); assert.match((await controls.command('status')).message, /could not open/);
    await controls.command('play'); await controls.command('stop'); assert.equal(children[2].killed, true); assert.equal((await controls.command('status')).signed_in, false);
    await assert.rejects(controls.command('status', { token: 'unexpected' }), /Unexpected/);
  } finally { if (controls) await controls.close(); await app.close(); }
});
test('desktop services retain one state owner, release failed starts, and restart only their isolated state', { skip: !available, timeout: 60000 }, async () => {
  const app = await environment(); let first, second, failed;
  try {
    const state = path.join(app.temp, 'desktop-heat');
    const free = async () => { const server = net.createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const port = server.address().port; await new Promise(resolve => server.close(resolve)); return port; };
    const port = await free(), playerPort = await free(), configFile = path.join(app.temp, 'desktop-toast-service.json'), listenerFile = path.join(app.temp, 'desktop-player-listener.json'), authorityFile = path.join(app.temp, 'desktop-authority-link.json');
    fs.writeFileSync(listenerFile, JSON.stringify({ bind: '127.0.0.1', port: playerPort, world_id: app.trust.world_id, cert_file: path.join(app.fixtures.directory, 'player.pem'), key_file: path.join(app.fixtures.directory, 'player.key') }));
    fs.writeFileSync(authorityFile, JSON.stringify({ endpoint: app.remote.endpoint, world_id: app.remote.world_id, server_spki: app.remote.server_spki, ca_file: path.join(app.fixtures.directory, 'ca.pem'), cert_file: path.join(app.fixtures.directory, 'toast.pem'), key_file: path.join(app.fixtures.directory, 'toast.key') }));
    const service = { port, game_root: gameRoot, state_dir: state, authority_config_file: authorityFile, player_listener_config_file: listenerFile };
    fs.writeFileSync(configFile, JSON.stringify(service));
    const config = { role: 'toast', networkApproved: false, gameRoot, playerConfigFile: app.playerFile, serviceConfigFile: configFile };
    first = createDesktopControls(config); second = createDesktopControls(config);
    assert.equal((await first.command('start')).service_running, true); await first.command('start');
    await assert.rejects(second.command('start'), /owns this state/);
    const failedState = path.join(app.temp, 'failed-start'); fs.writeFileSync(configFile, JSON.stringify({ ...service, state_dir: failedState })); failed = createDesktopControls(config);
    await assert.rejects(failed.command('start'), /address already in use/); assert.equal(fs.existsSync(path.join(failedState, 'desktop-owner.lock')), false);
    fs.writeFileSync(configFile, JSON.stringify(service)); await first.command('stop'); assert.equal(fs.existsSync(path.join(state, 'desktop-owner.lock')), false);
    assert.equal((await second.command('start')).service_running, true); await second.command('stop');
    const existing = path.join(app.temp, 'existing-real-state'); fs.mkdirSync(existing); fs.writeFileSync(path.join(existing, 'accounts.json'), '{}');
    assert.throws(() => acquire(existing, 'toast', app.trust.world_id), /separately approved cutover/); assert.equal(fs.readFileSync(path.join(existing, 'accounts.json'), 'utf8'), '{}');
    const release = acquire(state, 'toast', app.trust.world_id); assert.throws(() => acquire(state, 'authority', app.trust.world_id), /another role/); release();
    assert.throws(() => Config.leaf(app.fixtures.toast.cert, 1), /wrong service role/);
    const hostConfig = path.join(app.temp, 'desktop-host.json'); fs.writeFileSync(hostConfig, JSON.stringify({ bind: '127.0.0.1', port: await free(), world_id: app.trust.world_id, game_root: hostGameRoot,
      state_dir: path.join(app.temp, 'desktop-world'), toast_spki: app.fixtures.toastSpki, ca_file: path.join(app.fixtures.directory, 'ca.pem'), cert_file: path.join(app.fixtures.directory, 'server.pem'), key_file: path.join(app.fixtures.directory, 'server.key') }));
    const HostControls = require(path.join(hostVisitor, 'desktop-controls.cjs')).createDesktopControls;
    const hosted = HostControls({ ...config, role: 'authority', serviceConfigFile: hostConfig });
    try {
      assert.equal((await hosted.command('start')).service_running, true);
      const options = JSON.parse(fs.readFileSync(hostConfig)), adapter = createRemoteAuthority({ ...app.remote, endpoint: 'https://127.0.0.1:' + options.port });
      try { await adapter.start(); assert.equal(adapter.read().view.tick_hz, 30); } finally { adapter.close(); }
    } finally { await hosted.close(); }
  } finally { for (const controls of [first, second, failed]) if (controls) await controls.close(); await app.close(); }
});
test('native play renews short server tokens within bounded HEAT identity; receipts/awards, logout and expiry remain protected', { skip: !available, timeout: 60000 }, async () => {
  const original = hashes(); let time = 1791580000; const app = await environment(() => time);
  try {
    const a = await app.account('renewal_alpha'), b = await app.account('renewal_beta'), native = await app.native(); await native.link.call('login', a);
    const started = time, joined = await local(native, 'connect', { ticket: await native.admission() }); assert.equal(joined.status, 200);
    const token = joined.value.token, oldRemote = app.connections[0].token; assert.notEqual(token, oldRemote); assert.equal(joined.value.expires_unix, started + 8 * 3600);
    assert.equal((await local(native, 'input', { seq: 1, action: { type: 'claim', camp: 735, corporation: 'bruteforce' } }, token)).value.ok, true);
    time += 850; assert.equal((await local(native, 'state', undefined, token)).status, 200); assert.equal(app.connections.length, 2); assert.notEqual(app.connections[1].token, oldRemote);
    assert.equal(app.connections[1].profile_id, joined.value.profile_id); await assert.rejects(native.link.call('state', {}, oldRemote), /reconnect/);
    app.loseReply(); const build = { seq: 2, action: { type: 'build', camp: 735, kind: 'nc', x: 10, z: 33 } };
    assert.equal((await local(native, 'input', build, token)).status, 503); await pause(3500); time += 850;
    const retried = await local(native, 'input', build, token); assert.equal(retried.status, 200); assert.equal(retried.value.retry, true); assert.equal(retried.value.world.camps[0].entities.length, 1);
    let view = (await local(native, 'state', undefined, token)).value; await local(native, 'input', { seq: 3, action: { type: 'sync', frame: view.world.frame, active: true } }, token);
    await pause(300); time += 2; view = (await local(native, 'state', undefined, token)).value; await local(native, 'input', { seq: 4, action: { type: 'sync', frame: view.world.frame, active: true } }, token);
    const awards = await native.link.call('summary'); assert.equal(awards.degrees.balance, 100); assert.equal(awards.degrees.gameplay_seconds, 2); assert.equal(awards.trophies.granted.length, 1);
    time += 850; view = (await local(native, 'state', undefined, token)).value; await local(native, 'input', { seq: 5, action: { type: 'sync', frame: view.world.frame, active: true } }, token);
    assert.deepEqual(await native.link.call('summary'), awards, 'Renewal cannot add downtime credit or duplicate awards.');
    const count = app.connections.length; time = started + 8 * 3600 + 1; const ended = await local(native, 'state', undefined, token); assert.equal(ended.status, 401); assert.match(ended.value.error, /eight-hour/); assert.equal(app.connections.length, count);
    await native.stopGame(); const loggedOut = await app.native(); await loggedOut.link.call('login', a); const second = await local(loggedOut, 'connect', { ticket: await loggedOut.admission() });
    await loggedOut.link.call('logout'); assert.equal((await local(loggedOut, 'state', undefined, second.value.token)).status, 401); assert.equal(loggedOut.link.signedIn, false);
    const late = await app.native(), loginTime = time; await late.link.call('login', b); time += 7 * 86400 - 300;
    const lateJoin = await local(late, 'connect', { ticket: await late.admission() }); assert.equal(lateJoin.status, 200); time += 301;
    assert.equal((await local(late, 'state', undefined, lateJoin.value.token)).status, 401); assert.equal(late.link.signedIn, false);
    const accounts = JSON.parse(fs.readFileSync(path.join(app.state, 'accounts.json'))); assert.ok(Object.values(accounts.sessions).every(session => session.expires_unix <= loginTime + 7 * 86400), 'Renewal never extends the HEAT session.');
  } finally { await app.close(); assert.deepEqual(hashes(), original); }
});

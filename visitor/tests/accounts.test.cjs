'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const http = require('node:http');
const { EventEmitter } = require('node:events');
const M = require('../model.cjs');
const { createVisitorServer } = require('../server.cjs');
const root = path.resolve(__dirname, '../..');
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/two-camps.json'), 'utf8'));
function seal(report) {
  const facts = { ...report }; delete facts.canonical_payload; delete facts.sha256; delete facts.report_id;
  report.canonical_payload = M.canonical(facts); report.sha256 = crypto.createHash('sha256').update(report.canonical_payload).digest('hex');
  report.report_id = 'report-' + report.sha256; return report;
}
async function setup(extra = {}) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'heat-accounts-'));
  const game = path.join(temp, 'game');
  for (const dir of ['recovery/runtime', 'playable', 'saves']) fs.mkdirSync(path.join(game, dir), { recursive: true });
  fs.writeFileSync(path.join(game, 'recovery/runtime/Godot.exe'), 'test runtime'); fs.writeFileSync(path.join(game, 'playable/project.godot'), 'test project');
  fs.writeFileSync(path.join(game, 'saves/first-plot.json'), 'legacy save must be retained');
  let time = fixture.generated_unix + 10000;
  const launches = [];
  const options = { root, stateDir: path.join(temp, 'state'), gameRoot: game, now: () => time, pollMs: 20,
    spawnGame(executable, args) { const proc = new EventEmitter(); launches.push({ args, proc }); return proc; }, ...extra };
  let bridge, base;
  async function open() {
    bridge = createVisitorServer(options); await new Promise(resolve => bridge.server.listen(0, extra.listenHost || '127.0.0.1', resolve));
    base = `http://127.0.0.1:${bridge.server.address().port}`;
  }
  await open();
  return { temp, game, launches, get bridge() { return bridge; }, get time() { return time; }, advance(s) { time += s; },
    async get(cookie = '') { return (await fetch(base + '/api/visitor', { headers: { Cookie: cookie } })).json(); },
    async post(action, data = {}, cookie = '', origin = base) {
      const res = await fetch(base + '/api/visitor/' + action, { method: 'POST', headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      return { status: res.status, data: await res.json(), cookie: (res.headers.get('set-cookie') || '').split(';')[0], headers: res.headers };
    },
    async restart() { await new Promise(resolve => bridge.server.close(resolve)); await open(); },
    async cleanup() { await new Promise(resolve => bridge.server.close(resolve)); const actual = fs.realpathSync(temp);
      assert.ok(actual.startsWith(fs.realpathSync(os.tmpdir()) + path.sep)); fs.rmSync(actual, { recursive: true, force: true }); }
  };
}
const registration = (username, adopt_local = false) => ({ username, display_name: username, password: 'a long local test passphrase', adopt_local });
function heartbeat(s, account, launch, seconds) {
  const report = structuredClone(fixture), old = report.profile.id;
  report.profile.id = account.profile_id;
  for (const c of [...report.camps, ...report.registry]) if (c.owner_id === old) c.owner_id = account.profile_id;
  report.generated_unix = s.time;
  const started = Number(launch.args.find(a => a.startsWith('--heat-started=')).split('=')[1]);
  const id = launch.args.find(a => a.startsWith('--heat-session=')).split('=')[1];
  report.session = { id, started_unix: started, active_seconds: seconds };
  M.atomicJSON(path.join(s.bridge.reportDir, account.profile_id + '.json'), seal(report), M.validateReport);
  return report;
}
test('first account adopts stable pioneer; credentials, cookies, restart and logout protect it', async () => {
  const s = await setup();
  try {
    const id = s.bridge.identity.id;
    const created = await s.post('auth/register', registration('Pioneer_One', true));
    assert.equal(created.status, 200); assert.equal(created.data.account.profile_id, id);
    assert.match(created.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
    const mine = await s.get(created.cookie); assert.equal(mine.identity.id, id); assert.equal(mine.auth.account.username, 'pioneer_one');
    const anonymous = await s.get(); assert.equal(anonymous.identity, null); assert.deepEqual(anonymous.profiles, []); assert.equal(anonymous.launch.available, false);
    assert.equal((await s.post('launch')).status, 401); assert.equal((await s.post('profile', { display_name: 'intruder' })).status, 401);
    assert.equal((await s.post('auth/login', { username: 'pioneer_one', password: 'incorrect' })).status, 400);
    assert.equal((await s.post('auth/login', registration('PIONEER_ONE'))).status, 200);
    const disk = fs.readFileSync(path.join(s.bridge.stateDir, 'accounts.json'), 'utf8');
    assert.ok(!disk.includes(registration('x').password)); assert.ok(!disk.includes(created.cookie.split('=')[1]));
    assert.ok(!JSON.stringify(mine).includes('password_hash'));
    await s.restart(); assert.equal((await s.get(created.cookie)).identity.id, id);
    assert.equal((await s.post('auth/logout', {}, created.cookie)).status, 200); assert.equal((await s.get(created.cookie)).identity, null);
    assert.equal(fs.readFileSync(path.join(s.game, 'saves/first-plot.json'), 'utf8'), 'legacy save must be retained');
  } finally { await s.cleanup(); }
});
test('two signed-in players launch distinct identities and saves, preserve alias ownership, and earn separately without browser polling', async () => {
  const s = await setup();
  try {
    const a = await s.post('auth/register', registration('player_a', true));
    const b = await s.post('auth/register', registration('player_b'));
    assert.equal(a.status, 200); assert.equal(b.status, 200); assert.notEqual(a.data.account.profile_id, b.data.account.profile_id);
    assert.equal((await s.post('launch', { profile_id: a.data.account.profile_id }, b.cookie)).status, 400);
    assert.equal((await s.post('launch', {}, a.cookie)).status, 200); assert.equal((await s.post('launch', {}, b.cookie)).status, 200);
    assert.equal(s.launches.length, 2);
    const arg = (launch, key) => launch.args.find(v => v.startsWith(key + '=')).slice(key.length + 1);
    assert.equal(arg(s.launches[0], '--heat-save'), path.join(s.game, 'saves/first-plot.json'));
    assert.equal(arg(s.launches[1], '--heat-save'), path.join(s.bridge.stateDir, 'players', b.data.account.profile_id, 'first-plot.json'));
    assert.notEqual(arg(s.launches[0], '--heat-identity'), arg(s.launches[1], '--heat-identity'));
    assert.equal((await s.post('profile', { display_name: 'Renamed B' }, b.cookie)).status, 200);
    assert.equal((await s.get(a.cookie)).identity.display_name, 'Pioneer'); assert.equal((await s.get(b.cookie)).identity.display_name, 'Renamed B');
    s.advance(3600); heartbeat(s, a.data.account, s.launches[0], 3590); heartbeat(s, b.data.account, s.launches[1], 600);
    await new Promise(resolve => setTimeout(resolve, 80));
    const ledger = JSON.parse(fs.readFileSync(s.bridge.ledgerFile, 'utf8'));
    assert.equal(ledger.profiles[a.data.account.profile_id].gameplay_seconds, 3590);
    assert.equal(ledger.profiles[b.data.account.profile_id].gameplay_seconds, 600);
    // Exit before the final heartbeat is read. Its later cumulative report must still settle.
    s.launches[0].proc.emit('exit'); s.advance(10); heartbeat(s, a.data.account, s.launches[0], 3600);
    await s.restart();
    assert.equal((await s.get(a.cookie)).degrees.balance, 350); assert.equal((await s.get(b.cookie)).degrees.balance, 100);
    assert.equal((await s.get(a.cookie)).degrees.gameplay_seconds, 3600);
    assert.equal((await s.get(a.cookie)).degrees.gameplay_seconds, 3600);
    assert.equal((await s.post('launch', {}, a.cookie)).status, 200); s.advance(15); heartbeat(s, a.data.account, s.launches[2], 15);
    assert.equal((await s.get(a.cookie)).degrees.gameplay_seconds, 3615);
    assert.equal((await s.get(b.cookie)).degrees.gameplay_seconds, 600);
    assert.equal((await s.post('import', { report: heartbeat(s, b.data.account, s.launches[1], 600) }, a.cookie)).status, 400);
  } finally { await s.cleanup(); }
});
test('duplicate and invalid registrations, first-pioneer takeover, cross-origin actions and repeated guesses fail', async () => {
  const s = await setup();
  try {
    assert.equal((await s.post('auth/register', { ...registration('short'), password: 'tiny' })).status, 400);
    assert.equal((await s.post('auth/register', registration('../path'))).status, 400);
    const a = await s.post('auth/register', registration('account_one', true)); assert.equal(a.status, 200);
    assert.equal((await s.post('auth/register', registration('ACCOUNT_ONE'))).status, 400);
    assert.equal((await s.post('auth/register', registration('account_two', true))).status, 400);
    assert.equal((await s.post('auth/logout', {}, a.cookie, 'http://evil.example')).status, 400);
    assert.equal((await s.get(a.cookie)).auth.account.username, 'account_one');
    for (let n = 0; n < 10; n++) await s.post('auth/login', { username: 'account_one', password: 'wrong' });
    const limited = await s.post('auth/login', registration('account_one')); assert.equal(limited.status, 400); assert.match(limited.data.error, /Too many/);
    s.advance(301); assert.equal((await s.post('auth/login', registration('account_one'))).status, 200);
    s.advance(8 * 86400); assert.equal((await s.get(a.cookie)).identity, null);
  } finally { await s.cleanup(); }
});
test('damaged account store is preserved and cannot downgrade to guest mutation', async () => {
  const s = await setup();
  try {
    await s.post('auth/register', registration('account_one', true));
    const file = path.join(s.bridge.stateDir, 'accounts.json'); fs.writeFileSync(file, '{broken account store');
    await s.restart();
    const snapshot = await s.get(); assert.equal(snapshot.launch.available, false); assert.ok(snapshot.errors.length);
    assert.equal((await s.post('profile', { display_name: 'overwrite' })).status, 400);
    assert.equal((await s.post('auth/register', registration('replacement'))).status, 400);
    assert.equal(fs.readFileSync(file, 'utf8'), '{broken account store');
  } finally { await s.cleanup(); }
});
test('service restart retains a live launch guard and cannot open the same account save twice', async () => {
  let spawns = 0;
  const s = await setup({ spawnGame() { spawns++; const child = new EventEmitter(); child.pid = process.pid; return child; } });
  try {
    const a = await s.post('auth/register', registration('guarded_player'));
    const first = await s.post('launch', {}, a.cookie); assert.equal(first.status, 200);
    await s.restart(); assert.equal((await s.get(a.cookie)).launch.running, true);
    const repeat = await s.post('launch', {}, a.cookie); assert.equal(repeat.data.session_id, first.data.session_id); assert.equal(spawns, 1);
    // A dead recorded PID is cleared, without killing any process.
    const file = path.join(s.bridge.stateDir, 'running-games.json');
    const recorded = JSON.parse(fs.readFileSync(file, 'utf8')); recorded.games[a.data.account.profile_id].pid = 2147483647;
    M.atomicJSON(file, recorded); await s.restart(); assert.equal((await s.get(a.cookie)).launch.running, false);
    assert.equal((await s.post('launch', {}, a.cookie)).status, 200); assert.equal(spawns, 2);
  } finally { await s.cleanup(); }
});
const lanAddress = Object.values(os.networkInterfaces()).flat().find(i => i.family === 'IPv4' && !i.internal &&
  /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(i.address))?.address;
test('LAN address supports authenticated accounts but cannot launch a native game on the host', { skip: !lanAddress }, async () => {
  const s = await setup({ allowedHosts: [lanAddress], listenHost: '0.0.0.0' });
  try {
    assert.equal((await s.post('auth/register', registration('host_owner', true))).status, 200);
    const base = `http://${lanAddress}:${s.bridge.server.address().port}`;
    const remote = async (action, input, cookie = '') => fetch(base + '/api/visitor/' + action, { method: 'POST',
      headers: { Origin: base, Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
    const anonymous = await (await fetch(base + '/api/visitor')).json(); assert.equal(anonymous.identity, null); assert.equal(anonymous.auth.host_pc, false);
    const created = await remote('auth/register', registration('lan_pioneer')); assert.equal(created.status, 200);
    const cookie = created.headers.get('set-cookie').split(';')[0];
    const snapshot = await (await fetch(base + '/api/visitor', { headers: { Cookie: cookie } })).json();
    assert.equal(snapshot.auth.account.username, 'lan_pioneer'); assert.equal(snapshot.launch.available, false);
    const launch = await remote('launch', {}, cookie); assert.equal(launch.status, 400); assert.match((await launch.json()).error, /host PC/); assert.equal(s.launches.length, 0);
    assert.equal((await remote('profile', { display_name: 'LAN Pioneer' }, cookie)).status, 200);
    const wrongHost = await new Promise((resolve, reject) => {
      http.get(base + '/api/visitor', { headers: { Host: 'untrusted.example' } }, res => { res.resume(); resolve(res.statusCode); }).on('error', reject);
    });
    assert.equal(wrongHost, 403);
    assert.equal((await remote('auth/register', registration('cannot_adopt', true))).status, 400);
  } finally { await s.cleanup(); }
});

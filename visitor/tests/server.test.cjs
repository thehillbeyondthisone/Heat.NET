'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const M = require('../model.cjs');
const { createVisitorServer } = require('../server.cjs');
const root = path.resolve(__dirname, '../..');

const samplePath = path.join(__dirname, 'fixtures/two-camps.json');
let temp, bridge, base, source, time;
function sign(r) {
  const facts = { ...r }; delete facts.canonical_payload; delete facts.sha256; delete facts.report_id;
  r.canonical_payload = M.canonical(facts);
  r.sha256 = crypto.createHash('sha256').update(r.canonical_payload).digest('hex'); r.report_id = 'report-' + r.sha256;
  return r;
}
before(async () => {
  source = JSON.parse(fs.readFileSync(samplePath, 'utf8')); time = source.generated_unix + 10000;
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'heat-visitor-test-'));
  bridge = createVisitorServer({ root, stateDir: temp, now: () => time });
  await new Promise(resolve => bridge.server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${bridge.server.address().port}`;
});
after(async () => {
  await new Promise(resolve => bridge.server.close(resolve));
  const resolved = fs.realpathSync(temp);
  assert.ok(resolved.startsWith(fs.realpathSync(os.tmpdir()) + path.sep));
  fs.rmSync(resolved, { recursive: true, force: true });
});
async function post(route, data, origin = base) {
  return fetch(base + route, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
}
function foreign(id = 'local-' + 'b'.repeat(32)) {
  const r = structuredClone(source), old = r.profile.id;
  r.profile.id = id; r.profile.display_name = 'Comparison Pioneer';
  for (const c of [...r.camps, ...r.registry]) if (c.owner_id === old) c.owner_id = id;
  return sign(r);
}
test('cross-language Godot payload verifies; tampering and impossible aggregates fail', () => {
  assert.equal(M.validateReport(source), source);
  const changed = structuredClone(source); changed.aggregate.tu++;
  assert.throws(() => M.validateReport(changed), /checked payload/);
  sign(changed); assert.throws(() => M.validateReport(changed), /Aggregate/);
  const dup = structuredClone(source); dup.camps.push(dup.camps[0]); sign(dup);
  assert.throws(() => M.validateReport(dup), /duplicate/);
  const unknown = structuredClone(source); unknown.private_save = { path: 'example' }; sign(unknown);
  assert.throws(() => M.validateReport(unknown), /Unknown report/);
  const unknownDetail = structuredClone(source); unknownDetail.activity[0].details.free_text = 'example'; sign(unknownDetail);
  assert.throws(() => M.validateReport(unknownDetail), /activity fields/);
});
test('real archival pages, query URLs, health, empty state, and secret-file exclusions', async () => {
  const data = await (await fetch(base + '/api/visitor')).json();
  assert.equal(data.profiles.length, 0); assert.equal(data.degrees.balance, 0); assert.ok(M.PROFILE_ID.test(data.identity.id));
  assert.equal((await fetch(base + '/site/pages/10six.html?player=x')).status, 200);
  assert.equal((await fetch(base + '/api/visitor/health')).status, 200);
  for (const file of ['/.git/config', '/visitor/server.cjs', '/site/../package.json', '/saves/first-plot.json', '/site/%2e%2e%2fpackage.json'])
    assert.ok((await fetch(base + file)).status >= 400);
  const head = await fetch(base + '/site/pages/10six.html', { method: 'HEAD' });
  assert.equal(head.status, 200); assert.equal(await head.text(), '');
});
test('imports persist real reports for comparison, repeat safely and cannot award or replace own profile', async () => {
  const report = foreign();
  let res = await post('/api/visitor/import', { report }); assert.equal(res.status, 200);
  res = await post('/api/visitor/import', { report }); assert.equal(res.status, 200);
  const snapshot = await (await fetch(base + '/api/visitor')).json();
  assert.equal(snapshot.profiles.length, 1); assert.equal(snapshot.profiles[0].degrees.balance, null);
  assert.equal(snapshot.profiles[0].trophies.granted.length, 0);
  assert.equal(snapshot.catalog.active.some(t => t.image === '21102.gif'), false);
  assert.equal(snapshot.catalog.retired.every(t => t.grantable === false), true);
  for (const t of snapshot.catalog.retired.filter(t => ['community-tester', 'premium-potm'].includes(t.id))) {
    assert.equal(t.art_available, false); assert.equal(t.image_url, '');
  }
  const exported = await fetch(base + '/api/visitor/report?player=' + report.profile.id);
  assert.equal(exported.status, 200); assert.match(exported.headers.get('content-disposition'), /attachment; filename="local-/);
  assert.equal(M.validateReport(await exported.json()).report_id, report.report_id);
  const mine = foreign(bridge.identity.id);
  assert.equal((await post('/api/visitor/import', { report: mine })).status, 400);
  const bad = foreign('local-' + 'c'.repeat(32)); bad.profile.display_name = '<script>test</script>'; bad.sha256 = '0'.repeat(64);
  assert.equal((await post('/api/visitor/import', { report: bad })).status, 400);
  const disk = M.readJSON(path.join(temp, 'imports', report.profile.id + '.json'), M.validateReport);
  assert.equal(disk.report_id, report.report_id);
});
test('cross-origin writes fail and renamed identity remains compatible with game', async () => {
  const before = fs.readFileSync(path.join(temp, 'identity.json'), 'utf8');
  assert.equal((await post('/api/visitor/profile', { display_name: 'Wrong' }, 'https://example.com')).status, 400);
  assert.equal(fs.readFileSync(path.join(temp, 'identity.json'), 'utf8'), before);
  const id = bridge.identity.id;
  assert.equal((await post('/api/visitor/profile', { display_name: 'New Pioneer' })).status, 200);
  assert.equal(M.identity(path.join(temp, 'identity.json')).id, id);
  assert.equal(M.identity(path.join(temp, 'identity.json')).display_name, 'New Pioneer');
  assert.equal((await post('/api/visitor/profile', { display_name: '\n' })).status, 400);
  assert.equal((await post('/api/visitor/profile', { display_name: 'Bad\x7fName' })).status, 400);
});
test('bad live report is retained and never silently displayed or credited', async () => {
  fs.mkdirSync(bridge.reportDir, { recursive: true });
  const file = path.join(bridge.reportDir, bridge.identity.id + '.json');
  fs.writeFileSync(file, '{broken');
  const data = await (await fetch(base + '/api/visitor')).json();
  assert.ok(data.errors.length > 0); assert.equal(data.degrees.balance, 0);
  assert.equal(fs.readFileSync(file, 'utf8'), '{broken');
});
test('confirmed opt-in session earns once and survives service restart', async () => {
  const isolated = path.join(temp, 'launch'), game = path.join(temp, 'game');
  fs.mkdirSync(path.join(game, 'recovery/runtime'), { recursive: true }); fs.mkdirSync(path.join(game, 'playable'), { recursive: true });
  fs.writeFileSync(path.join(game, 'recovery/runtime/Godot.exe'), 'test engine marker'); fs.writeFileSync(path.join(game, 'playable/project.godot'), 'test project marker');
  let args, proc = new EventEmitter();
  const s = createVisitorServer({ root, stateDir: isolated, gameRoot: game, now: () => time,
    spawnGame: (file, arguments_, options) => { args = arguments_; assert.equal(options.shell, false); assert.equal(options.windowsHide, false, 'The interactive game window must be visible'); return proc; } });
  await new Promise(resolve => s.server.listen(0, '127.0.0.1', resolve));
  const address = `http://127.0.0.1:${s.server.address().port}`;
  try {
    const launch = await (await fetch(address + '/api/visitor/launch', { method: 'POST', headers: { Origin: address, 'Content-Type': 'application/json' }, body: '{}' })).json();
    assert.equal(s.snapshot().degrees.balance, 0); assert.ok(args.includes('--heat-session=' + launch.session_id));
    assert.equal((await (await fetch(address + '/api/visitor/launch', { method: 'POST', headers: { Origin: address, 'Content-Type': 'application/json' }, body: '{}' })).json()).session_id, launch.session_id);
    const r = foreign(s.identity.id); r.profile.display_name = s.identity.display_name;
    r.generated_unix = time; r.session = { id: launch.session_id, started_unix: time, active_seconds: 0 };
    sign(r); fs.mkdirSync(s.reportDir, { recursive: true }); M.atomicJSON(path.join(s.reportDir, r.profile.id + '.json'), r, M.validateReport);
    assert.equal(s.snapshot().degrees.balance, 100); assert.equal(s.snapshot().degrees.balance, 100);
    time += 3600; r.generated_unix = time; r.session.active_seconds = 3600; sign(r);
    M.atomicJSON(path.join(s.reportDir, r.profile.id + '.json'), r, M.validateReport);
    assert.equal(s.snapshot().degrees.balance, 350);
    proc.emit('exit'); assert.equal(s.snapshot().launch.running, false);
    const restarted = createVisitorServer({ root, stateDir: isolated, gameRoot: game, now: () => time });
    assert.equal(restarted.snapshot().degrees.balance, 350);
  } finally { await new Promise(resolve => s.server.close(resolve)); }
});
test('damaged identity/ledger are preserved and mutating actions stop', async () => {
  const broken = path.join(temp, 'broken'); fs.mkdirSync(broken); fs.writeFileSync(path.join(broken, 'identity.json'), '{broken');
  const s = createVisitorServer({ root, stateDir: broken, now: () => time });
  assert.equal(s.snapshot().launch.available, false); assert.ok(s.snapshot().errors.length > 0);
  assert.equal(fs.readFileSync(path.join(broken, 'identity.json'), 'utf8'), '{broken');
});

test('launch stays safe on repeat clicks and opens a fresh session after quitting', async () => {
  const game = path.join(temp, 'relaunch-game'), processes = [];
  fs.mkdirSync(path.join(game, 'recovery/runtime'), { recursive: true }); fs.mkdirSync(path.join(game, 'playable'), { recursive: true });
  fs.writeFileSync(path.join(game, 'recovery/runtime/Godot.exe'), 'test engine marker'); fs.writeFileSync(path.join(game, 'playable/project.godot'), 'test project marker');
  const s = createVisitorServer({ root, stateDir: path.join(temp, 'relaunch'), gameRoot: game, now: () => time,
    spawnGame: () => { const process = new EventEmitter(); processes.push(process); return process; } });
  await new Promise(resolve => s.server.listen(0, '127.0.0.1', resolve));
  const address = `http://127.0.0.1:${s.server.address().port}`;
  const launch = async () => {
    const response = await fetch(address + '/api/visitor/launch', { method: 'POST',
      headers: { Origin: address, 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(response.status, 200); return response.json();
  };
  try {
    const first = await launch();
    assert.equal((await launch()).session_id, first.session_id);
    assert.equal(processes.length, 1);
    processes[0].emit('exit');
    assert.equal(s.snapshot().launch.running, false);
    const reopened = await launch();
    assert.notEqual(reopened.session_id, first.session_id);
    assert.equal(s.snapshot().launch.running, true);
    assert.equal(processes.length, 2);
    assert.equal((await launch()).session_id, reopened.session_id);
    assert.equal(processes.length, 2);
    processes[1].emit('exit');
    assert.equal(s.snapshot().degrees.balance, 0);
  } finally { await new Promise(resolve => s.server.close(resolve)); }
});

'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { createVisitorServer } = require('../server.cjs');
const { createMessenger, OZY } = require('../messenger.cjs');
const D = require('../degrees.cjs');
const root = path.resolve(__dirname, '../..');
async function setup() {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'heat-messenger-test-'));
  let time = Date.parse('2026-10-09T17:00:00Z') / 1000, bridge, base;
  const open = async () => { bridge = createVisitorServer({ root, stateDir, now: () => time }); await new Promise(r => bridge.server.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${bridge.server.address().port}`; };
  await open();
  const request = async (route, cookie = '', payload, origin = base) => {
    const res = await fetch(base + '/api/visitor/' + route, { method: payload === undefined ? 'GET' : 'POST',
      headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json' }, body: payload === undefined ? undefined : JSON.stringify(payload) });
    return { status: res.status, data: await res.json(), cookie: (res.headers.get('set-cookie') || '').split(';')[0] };
  };
  return { request, stateDir, get time() { return time; }, advance(seconds) { time += seconds; },
    async account(username) { const result = await request('auth/register', '', { username, display_name: username, password: 'isolated test passphrase', adopt_local: false }); assert.equal(result.status, 200); return { ...result.data.account, cookie: result.cookie }; },
    async restart() { await new Promise(r => bridge.server.close(r)); await open(); },
    async cleanup() { await new Promise(r => bridge.server.close(r)); const actual = fs.realpathSync(stateDir); assert.ok(actual.startsWith(fs.realpathSync(os.tmpdir()) + path.sep)); fs.rmSync(actual, { recursive: true, force: true }); }
  };
}
const page = (to, text = 'A private page', request_id = crypto.randomUUID()) => ({ to, text, request_id });

test('private offline pages use accounts without camp reports; unread, retry and restart remain isolated', async () => {
  const s = await setup();
  try {
    const a = await s.account('archivist'), b = await s.account('buddy'), c = await s.account('outsider');
    assert.equal((await s.request('messenger')).status, 401);
    const roster = (await s.request('messenger', a.cookie)).data;
    assert.equal(roster.players.length, 4); assert.ok(roster.players.every(p => !Object.hasOwn(p, 'password_hash') && !Object.hasOwn(p, 'salt')));
    const input = page(b.profile_id, '<img src=x onerror=alert(1)>\nHello buddy');
    const sent = await s.request('messenger/send', a.cookie, { ...input, from: c.profile_id }); assert.equal(sent.status, 200);
    assert.equal(sent.data.message.from, a.profile_id);
    assert.equal((await s.request('messenger/send', a.cookie, input)).data.duplicate, true);
    assert.equal((await s.request('messenger/send', a.cookie, { ...input, text: 'changed' })).status, 400);
    const inbox = (await s.request('messenger', b.cookie)).data; assert.equal(inbox.unread, 1);
    assert.equal((await s.request('messenger?player=' + a.profile_id, c.cookie)).data.messages.length, 0);
    assert.equal((await s.request('messenger?player=' + a.profile_id, b.cookie)).data.messages[0].text, input.text);
    assert.equal((await s.request('messenger', b.cookie)).data.unread, 1, 'Polling alone does not mark read');
    assert.equal((await s.request('messenger/contact', b.cookie, { player: a.profile_id, action: 'read', through: sent.data.message.id })).status, 200);
    await s.restart();
    assert.equal((await s.request('messenger', b.cookie)).data.unread, 0);
    assert.equal((await s.request('messenger?player=' + b.profile_id, a.cookie)).data.messages.length, 1);
    assert.equal((await s.request('messenger/send', a.cookie, input)).data.duplicate, true);
    assert.equal((await s.request('messenger/contact', c.cookie, { player: a.profile_id, action: 'read', through: sent.data.message.id })).status, 400);
    assert.equal((await s.request('messenger?player=local-' + 'f'.repeat(32), a.cookie)).status, 400);
  } finally { await s.cleanup(); }
});

test('presence follows valid browser sessions, away, expiry, logout and multiple sign-ins', async () => {
  const s = await setup();
  try {
    const a = await s.account('presence'), b = await s.account('watcher');
    const status = async () => (await s.request('messenger', b.cookie)).data.players.find(p => p.profile_id === a.profile_id).status;
    assert.equal(await status(), 'offline');
    await s.request('messenger/presence', a.cookie, { status: 'online' }); assert.equal(await status(), 'online');
    await s.request('messenger/presence', a.cookie, { status: 'away' }); assert.equal(await status(), 'away');
    const other = await s.request('auth/login', '', { username: 'presence', password: 'isolated test passphrase' });
    await s.request('messenger/presence', other.cookie, { status: 'online' });
    await s.request('auth/logout', a.cookie, {}); assert.equal(await status(), 'online');
    s.advance(46); assert.equal(await status(), 'offline');
    await s.request('messenger/presence', other.cookie, { status: 'online' }); assert.equal(await status(), 'online');
    await s.restart(); assert.equal(await status(), 'offline');
    await s.request('messenger/presence', other.cookie, { status: 'online' });
    s.advance(7 * 86400 + 1); assert.equal((await s.request('messenger', other.cookie)).status, 401);
  } finally { await s.cleanup(); }
});

test('buddies persist and blocking stops both directions without destroying earlier pages', async () => {
  const s = await setup();
  try {
    const a = await s.account('friendly'), b = await s.account('contact');
    await s.request('messenger/send', a.cookie, page(b.profile_id));
    await s.request('messenger/contact', a.cookie, { action: 'buddy', player: b.profile_id, enabled: true });
    await s.request('messenger/contact', b.cookie, { action: 'block', player: a.profile_id, enabled: true });
    assert.equal((await s.request('messenger/send', a.cookie, page(b.profile_id))).status, 400);
    assert.equal((await s.request('messenger/send', b.cookie, page(a.profile_id))).status, 400);
    await s.restart(); assert.equal((await s.request('messenger', a.cookie)).data.players.find(p => p.profile_id === b.profile_id).buddy, true);
    assert.equal((await s.request('messenger?player=' + b.profile_id, a.cookie)).data.messages.length, 1);
    await s.request('messenger/contact', b.cookie, { action: 'block', player: a.profile_id, enabled: false });
    assert.equal((await s.request('messenger/send', a.cookie, page(b.profile_id))).status, 200);
    assert.equal((await s.request('messenger/send', a.cookie, page(a.profile_id))).status, 400);
  } finally { await s.cleanup(); }
});

test('Ozymandias first-page race awards exactly 10,000 once per day across retries and restart', async () => {
  const s = await setup();
  try {
    const a = await s.account('racer_one'), b = await s.account('racer_two');
    assert.equal((await s.request('messenger/send', a.cookie, page(OZY))).status, 400);
    assert.equal((await s.request('messenger/event', a.cookie, {})).status, 200);
    const first = page(OZY), second = page(OZY);
    const results = await Promise.all([s.request('messenger/send', a.cookie, first), s.request('messenger/send', b.cookie, second)]);
    assert.ok(results.every(r => r.status === 200));
    const ledger = JSON.parse(fs.readFileSync(path.join(s.stateDir, 'degrees.json')));
    const winners = Object.entries(ledger.profiles).filter(([, p]) => p.balance === 10000); assert.equal(winners.length, 1);
    assert.equal(Object.values(ledger.profiles).reduce((n, p) => n + p.balance, 0), 10000);
    assert.equal((await s.request('messenger/event', a.cookie, {})).status, 400);
    await s.request('messenger/send', a.cookie, first); await s.restart();
    assert.equal((await s.request('messenger/event', b.cookie, {})).status, 400);
    const balance = JSON.parse(fs.readFileSync(path.join(s.stateDir, 'degrees.json')));
    assert.equal(balance.profiles[winners[0][0]].balance, 10000);
    assert.equal(balance.profiles[winners[0][0]].transactions.length, 1);
    assert.equal(balance.profiles[winners[0][0]].gameplay_seconds, 0);
    s.advance(301); assert.equal((await s.request('messenger', a.cookie)).data.event.status, 'offline');
    s.advance(86400); assert.equal((await s.request('messenger/event', a.cookie, {})).status, 200);
    await s.request('messenger/send', a.cookie, page(OZY));
    const next = JSON.parse(fs.readFileSync(path.join(s.stateDir, 'degrees.json')));
    assert.equal(Object.values(next.profiles).reduce((n, p) => n + p.balance, 0), 20000);
    assert.equal((await s.request('auth/register', '', { username: 'Ozymandias', display_name: 'Imposter', password: 'isolated test passphrase' })).status, 400);
  } finally { await s.cleanup(); }
});

test('durable winner recovers an interrupted Degree credit; remote hosts cannot open visits', () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'heat-prize-test-'));
  try {
    const id = 'local-' + '1'.repeat(32), now = () => Date.parse('2026-10-09T17:00:00Z') / 1000;
    const directory = () => [{ profile_id: id, username: 'winner', display_name: 'Winner' }];
    let messenger = createMessenger(stateDir, now, directory, () => true, () => false);
    assert.throws(() => messenger.openVisit(false), /host PC/); messenger.openVisit(true); messenger.send(id, page(OZY));
    messenger = createMessenger(stateDir, now, directory, () => true, () => false);
    const ledger = D.newLedger(); assert.equal(messenger.reconcile(ledger), true); assert.equal(messenger.reconcile(ledger), false);
    assert.equal(ledger.profiles[id].balance, 10000);
  } finally { const actual = fs.realpathSync(stateDir); assert.ok(actual.startsWith(fs.realpathSync(os.tmpdir()) + path.sep)); fs.rmSync(actual, { recursive: true, force: true }); }
});

test('Messenger rejects cross-origin writes, overlong/control pages, invented recipients and burst sends', async () => {
  const s = await setup();
  try {
    const a = await s.account('sender'), b = await s.account('receiver');
    assert.equal((await s.request('messenger/send', a.cookie, page(b.profile_id), 'http://elsewhere.invalid')).status, 400);
    for (const input of [page(b.profile_id, 'x'.repeat(2001)), page(b.profile_id, '\u0000'), page('local-' + 'f'.repeat(32)), page(b.profile_id, 'hello', 'bad')])
      assert.equal((await s.request('messenger/send', a.cookie, input)).status, 400);
    for (let n = 0; n < 20; n++) assert.equal((await s.request('messenger/send', a.cookie, page(b.profile_id))).status, 200);
    assert.equal((await s.request('messenger/send', a.cookie, page(b.profile_id))).status, 400);
    s.advance(31); assert.equal((await s.request('messenger/send', a.cookie, page(b.profile_id))).status, 200);
  } finally { await s.cleanup(); }
});

test('damaged Messenger state is retained and never replaced with an empty inbox', async () => {
  const s = await setup();
  try {
    const a = await s.account('recovery'); const file = path.join(s.stateDir, 'messenger.json');
    fs.writeFileSync(file, 'damaged private pages'); await s.restart();
    assert.equal((await s.request('messenger', a.cookie)).status, 400);
    assert.equal((await s.request('messenger/event', a.cookie, {})).status, 400);
    assert.equal(fs.readFileSync(file, 'utf8'), 'damaged private pages');
  } finally { await s.cleanup(); }
});

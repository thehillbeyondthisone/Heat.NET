'use strict';
// Account-backed local/LAN reconstruction. Presence is ephemeral; pages are durable.
const path = require('node:path');
const M = require('./model.cjs');
const D = require('./degrees.cjs');
const P = require('./messenger-policy.json');
const OZY = 'event-ozymandias';
const SOURCE = '/site/pages/ozymandias-evidence.html';
const member = id => M.PROFILE_ID.test(id || '') || id === OZY;
function validate(data) {
  M.assert(M.plain(data) && data.version === 1 && M.integer(data.next, 1) && Array.isArray(data.messages) &&
    data.messages.length <= P.message_limit && M.plain(data.contacts) && M.plain(data.visits), 'Messenger store needs recovery.');
  let previous = 0; const requests = new Set();
  for (const msg of data.messages) {
    const key = msg.from + ':' + msg.request;
    M.assert(M.plain(msg) && M.integer(msg.id, 1) && msg.id > previous && msg.id < data.next &&
      M.PROFILE_ID.test(msg.from || '') && member(msg.to) && msg.to !== msg.from &&
      typeof msg.text === 'string' && msg.text.trim() && msg.text.length <= P.message_characters && !/[\x00-\x08\x0b-\x1f\x7f]/.test(msg.text) &&
      /^[a-f0-9-]{36}$/.test(msg.request || '') && !requests.has(key) && M.number(msg.unix), 'Invalid private page.');
    previous = msg.id; requests.add(key);
  }
  for (const [id, c] of Object.entries(data.contacts)) {
    M.assert(M.PROFILE_ID.test(id) && M.plain(c) && Array.isArray(c.buddies) && Array.isArray(c.blocked) && M.plain(c.read), 'Invalid buddy list.');
    for (const list of [c.buddies, c.blocked]) M.assert(list.length <= 257 && new Set(list).size === list.length && list.every(other => member(other) && other !== id), 'Invalid buddy entry.');
    for (const [other, seq] of Object.entries(c.read)) M.assert(member(other) && M.integer(seq) && seq < data.next, 'Invalid read position.');
  }
  for (const [day, visit] of Object.entries(data.visits)) {
    M.assert(/^\d{4}-\d{2}-\d{2}$/.test(day) && M.plain(visit) && M.number(visit.opened) &&
      D.dayKey(visit.opened) === day && visit.until === visit.opened + P.ozymandias.visit_seconds, 'Invalid Ozymandias visit.');
    if (visit.winner) {
      const msg = data.messages.find(m => m.id === visit.message);
      M.assert(M.PROFILE_ID.test(visit.winner) && msg && msg.from === visit.winner && msg.to === OZY &&
        msg.unix >= visit.opened && msg.unix < visit.until && D.dayKey(msg.unix) === day, 'Invalid contest winner.');
    } else M.assert(visit.winner === '' && visit.message === 0, 'Invalid open contest.');
  }
  return data;
}
function createMessenger(stateDir, now, directory, sessionActive, inGame) {
  const file = path.join(stateDir, 'messenger.json');
  let data, error = ''; const presence = new Map(), limits = new Map();
  try { data = M.readJSON(file, validate) || { version: 1, next: 1, messages: [], contacts: {}, visits: {} }; }
  catch { error = 'Your Messenger store needs recovery. Its files were retained.'; }
  const guard = () => M.assert(!error, error);
  const save = next => { M.atomicJSON(file, next, validate); data = next; };
  const contacts = (state, id) => state.contacts[id] ||= { buddies: [], blocked: [], read: {} };
  const blocked = (a, b) => data.contacts[a]?.blocked.includes(b) || data.contacts[b]?.blocked.includes(a);
  function person(id) {
    if (id === OZY) return { profile_id: OZY, username: 'ozymandias', display_name: 'OZYMANDIAS', event_persona: true };
    const found = directory().find(p => p.profile_id === id);
    M.assert(found, 'That HEAT account was not found. Imported reports cannot receive pages.'); return found;
  }
  function status(id) {
    if (id === OZY) { const v = data.visits[D.dayKey(now())]; return v && now() >= v.opened && now() < v.until ? 'online' : 'offline'; }
    if (inGame(id)) return 'in_game';
    let result = 'offline';
    for (const [key, p] of presence) {
      if (p.until <= now() || !sessionActive(key)) { presence.delete(key); continue; }
      if (p.id === id && (p.status === 'online' || result === 'offline')) result = p.status;
    }
    return result;
  }
  function heartbeat(id, key, value) {
    guard(); M.assert(key && ['online', 'away', 'offline'].includes(value), 'Choose Online, Away or Offline.');
    if (value === 'offline') presence.delete(key);
    else presence.set(key, { id, status: value, until: now() + P.presence_seconds });
  }
  function view(id, host) {
    guard(); const c = data.contacts[id] || { buddies: [], blocked: [], read: {} };
    const players = [...directory(), person(OZY)].map(p => ({ ...p, status: status(p.profile_id),
      buddy: c.buddies.includes(p.profile_id), blocked: c.blocked.includes(p.profile_id) }));
    const unread = other => data.messages.filter(m => m.from === other && m.to === id && m.id > (c.read[other] || 0)).length;
    const ids = new Set(data.messages.filter(m => m.from === id || m.to === id).map(m => m.from === id ? m.to : m.from));
    const conversations = [...ids].map(other => {
      const last = data.messages.findLast(m => (m.from === id && m.to === other) || (m.from === other && m.to === id));
      return { profile_id: other, last_id: last.id, last_text: last.text, last_unix: last.unix, unread: unread(other) };
    }).sort((a, b) => b.last_id - a.last_id);
    const day = D.dayKey(now()), visit = data.visits[day];
    return { version: 1, self_id: id, players, conversations, unread: conversations.reduce((sum, c) => sum + c.unread, 0),
      event: { id: OZY, day, amount: P.ozymandias.degrees, status: status(OZY), opened: visit?.opened || 0, until: visit?.until || 0,
        claimed: Boolean(visit?.winner), won_by_you: visit?.winner === id, can_open: host && !visit, source: SOURCE,
        classification: 'RECONSTRUCTED', policy: 'Host opens one five-minute visit per Chicago day; first page wins.' }, generated_unix: now() };
  }
  function thread(id, other, before = 0) {
    guard(); person(other); M.assert(other !== id, 'Choose another player.');
    M.assert(M.integer(before), 'Invalid history position.');
    const all = data.messages.filter(m => ((m.from === id && m.to === other) || (m.from === other && m.to === id)) && (!before || m.id < before));
    const messages = all.slice(-P.history_page_size);
    return { version: 1, self_id: id, peer: person(other), messages, more: all.length > messages.length };
  }
  function send(id, input) {
    guard(); const other = input.to; person(other);
    M.assert(other !== id, 'Choose another player.');
    M.assert(typeof input.text === 'string' && input.text.trim() && input.text.length <= P.message_characters &&
      !/[\x00-\x08\x0b-\x1f\x7f]/.test(input.text), 'Write a page of 1–2,000 characters.');
    M.assert(/^[a-f0-9-]{36}$/.test(input.request_id || ''), 'This page needs a request ID.');
    const text = input.text.trim(), duplicate = data.messages.find(m => m.from === id && m.request === input.request_id);
    if (duplicate) {
      M.assert(duplicate.to === other && duplicate.text === text, 'That request ID already belongs to a different page.');
      return { ok: true, message: duplicate, duplicate: true };
    }
    M.assert(!blocked(id, other), 'Paging is blocked between these accounts.');
    if (other === OZY) M.assert(status(OZY) === 'online', 'OZYMANDIAS is offline. Watch for his next visit.');
    const recent = (limits.get(id) || []).filter(t => t > now() - P.burst_seconds);
    M.assert(recent.length < P.burst_messages, 'Please wait before sending more pages.');
    const next = structuredClone(data);
    M.assert(next.messages.length < P.message_limit, 'Messenger storage is full. Existing pages were retained.');
    const message = { id: next.next++, from: id, to: other, text, request: input.request_id, unix: now() };
    next.messages.push(message);
    if (other === OZY) {
      const v = next.visits[D.dayKey(now())]; if (!v.winner) { v.winner = id; v.message = message.id; }
    }
    save(next); recent.push(now()); limits.set(id, recent); return { ok: true, message, duplicate: false };
  }
  function update(id, input) {
    guard(); const other = input.player; person(other); M.assert(other !== id, 'Choose another player.');
    const next = structuredClone(data), c = contacts(next, id);
    if (input.action === 'read') {
      M.assert(M.integer(input.through, 1) && data.messages.some(m => m.id === input.through && m.from === other && m.to === id), 'Invalid received page.');
      c.read[other] = Math.max(c.read[other] || 0, input.through);
    } else {
      M.assert(['buddy', 'block'].includes(input.action) && typeof input.enabled === 'boolean', 'Unknown contact action.');
      M.assert(input.action !== 'block' || other !== OZY, 'The event contact cannot be blocked.');
      const list = input.action === 'buddy' ? 'buddies' : 'blocked';
      c[list] = c[list].filter(p => p !== other); if (input.enabled) c[list].push(other);
    }
    if (M.canonical(next) !== M.canonical(data)) save(next);
    return { ok: true };
  }
  function openVisit(host) {
    guard(); M.assert(host, 'Only the host PC can open the local event.');
    const day = D.dayKey(now()); M.assert(!data.visits[day], 'OZYMANDIAS has already visited today.');
    const next = structuredClone(data); next.visits[day] = { opened: now(), until: now() + P.ozymandias.visit_seconds, winner: '', message: 0 };
    save(next); return { ok: true };
  }
  function reconcile(ledger) {
    guard(); let changed = false;
    // Durable winner first, idempotent Degree transaction second. Restart repairs an interrupted credit.
    for (const [day, v] of Object.entries(data.visits)) if (v.winner)
      changed = D.creditOzymandias(ledger, v.winner, day, data.messages.find(m => m.id === v.message).unix) || changed;
    return changed;
  }
  return { view, thread, send, update, heartbeat, openVisit, reconcile, forget: key => presence.delete(key), get error() { return error; } };
}
module.exports = { createMessenger, validate, OZY, SOURCE };

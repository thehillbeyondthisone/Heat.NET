'use strict';
// RESTORED game adapter: HEAT supplies identity and award callbacks; Godot owns gameplay.
const fs = require('node:fs');
const path = require('node:path');
const { createGodotAuthority } = require('./godot-authority.cjs');
const { createRemoteAuthority } = require('./authority-client.cjs');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const M = require('./model.cjs');
const D = require('./degrees.cjs');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const random = () => crypto.randomBytes(32).toString('hex');
const KIND = '10six-server-v1';
function validate(data) {
  M.assert(M.plain(data) && data.version === 1 && M.plain(data.members) && M.plain(data.checkpoint), 'Shared Visitor state needs recovery.');
  for (const [id, member] of Object.entries(data.members)) M.assert(M.PROFILE_ID.test(id) &&
    M.SESSION_ID.test(member.session_id) && M.number(member.started_unix, 1) && M.number(member.active_seconds) &&
    M.integer(member.seq) && typeof member.entered === 'boolean', 'Invalid shared participation record.');
  return data;
}
function createMultiplayer({ stateDir, gameRoot, now, accountActive, localRunning, award, remoteAuthority, authorityFactory, spawnAuthority = spawn }) {
  const file = path.join(stateDir, remoteAuthority ? 'multiplayer-remote.json' : 'multiplayer.json');
  let data = M.readJSON(file, validate) || { version: 1, members: {}, checkpoint: {} };
  const authority = authorityFactory ? authorityFactory() : remoteAuthority ? createRemoteAuthority(remoteAuthority) : createGodotAuthority({ gameRoot, spawnAuthority });
  let view = null, latestCheckpoint = data.checkpoint, error = '';
  let queue = Promise.resolve();
  const tickets = new Map(), clients = new Map(), activity = new Map();
  const available = authority.available;
  function persist(next) { M.atomicJSON(file, next, validate); data = next; }
  function settle() {
    for (const [profileId, member] of Object.entries(data.members)) if (member.entered) award({
      authority: KIND, profile_id: profileId, session_id: member.session_id,
      started_unix: member.started_unix, active_seconds: member.active_seconds,
      generated_unix: now(), camps: (view?.camps || []).filter(c => c.owner_id === profileId),
    });
  }
  function playerView(profileId) { const result = structuredClone(view); for (const camp of result?.camps || []) if (camp.owner_id !== profileId) delete camp.items; return result; }
  function fail(reason) { error = reason; authority.reset(); view = null; }
  async function refresh() {
    const result = authority.remote ? await authority.refresh() : authority.read();
    view = result.view; latestCheckpoint = result.checkpoint;
    M.assert(view, error || 'Shared authority is unavailable.');
  }
  async function start() { await authority.start(data.checkpoint); await refresh(); error = ''; }
  function applyReceipt(next, id, receipt) {
    const member = next.members[id];
    M.assert(receipt.active_seconds >= member.active_seconds, 'Authority receipt counter regressed.');
    member.active_seconds = receipt.active_seconds; member.entered = receipt.entered;
    member.seq = receipt.seq; member.digest = member.pending.digest;
    member.result = { ok: receipt.ok, error: receipt.error || '', seq: receipt.seq };
    delete member.pending; next.checkpoint = {};
  }
  function prune() {
    for (const [key, t] of tickets) if (t.expires <= now() || !accountActive(t.accountKey)) tickets.delete(key);
    for (const [key, c] of clients) if (c.expires <= now() || !accountActive(c.accountKey)) { clients.delete(key); activity.delete(c.profileId); }
  }
  function issue(profileId, displayName, accountKey) {
    prune(); M.assert(available, 'The shared Godot runtime is unavailable.');
    M.assert(tickets.size < 256, 'Too many outstanding game admissions.');
    const ticket = random(); tickets.set(hash(ticket), { profileId, displayName, accountKey, expires: now() + 30 });
    return { ok: true, ticket, expires_unix: now() + 30, adapter: KIND };
  }
  async function doConnect(ticket, requiredAccountKey = '') {
    prune(); const admission = tickets.get(hash(typeof ticket === 'string' ? ticket : ''));
    M.assert(admission, 'That admission ticket is expired or already used.');
    M.assert(!requiredAccountKey || admission.accountKey === requiredAccountKey, 'Admission belongs to another HEAT session.');
    tickets.delete(hash(ticket)); await start();
    M.assert(accountActive(admission.accountKey) && admission.expires > now(), 'Sign in again to obtain a fresh admission.');
    M.assert(!localRunning(admission.profileId), 'Save and close your local plot first.');
    // A reconnect rotates the client token and retains the same receipt and command sequence.
    for (const [key, c] of clients) if (c.profileId === admission.profileId) clients.delete(key);
    activity.delete(admission.profileId);
    if (!data.members[admission.profileId]) {
      const next = structuredClone(data); next.members[admission.profileId] = {
        session_id: 'session-' + crypto.randomBytes(16).toString('hex'), started_unix: now(), active_seconds: 0, entered: false, seq: 0,
      }; persist(next);
    } else if (D.dayKey(data.members[admission.profileId].started_unix) !== D.dayKey(now())) {
      // A deliberate new launch on a new Chicago date starts a new attendance session.
      const next = structuredClone(data), member = next.members[admission.profileId];
      member.session_id = 'session-' + crypto.randomBytes(16).toString('hex');
      member.started_unix = now(); member.active_seconds = 0; member.entered = false;
      delete member.admission_seq; delete member.remote_generation; delete member.remote_admission_confirmed; delete member.pending; persist(next);
    }
    let generation;
    if (authority.remote) {
      let next = structuredClone(data), member = next.members[admission.profileId];
      if (member.remote_admission_confirmed !== false) {
        member.admission_seq = (member.admission_seq || 0) + 1; member.remote_generation = random(); member.remote_admission_confirmed = false;
        persist(next);
      }
      member = data.members[admission.profileId]; generation = member.remote_generation;
      await authority.admit({ profile_id: admission.profileId, session_id: member.session_id, generation,
        admission_seq: member.admission_seq, next_seq: member.seq + 1 });
      next = structuredClone(data); next.members[admission.profileId].remote_admission_confirmed = true; persist(next);
      // Resolve an input persisted before an uncertain network/HEAT write failure.
      const pending = data.members[admission.profileId].pending;
      if (pending) {
        try {
          const receipt = await authority.execute({ profile_id: admission.profileId, session_id: member.session_id, generation, seq: pending.seq, action: pending.action });
          next = structuredClone(data); applyReceipt(next, admission.profileId, receipt); persist(next);
        } catch (cause) {
          if (!cause.definitive) throw cause;
          next = structuredClone(data); delete next.members[admission.profileId].pending; persist(next);
        }
      }
      await refresh(); settle();
    }
    const token = random(), expires = now() + 900;
    clients.set(hash(token), { ...admission, expires, generation });
    return { ok: true, token, expires_unix: expires, profile_id: admission.profileId, next_seq: data.members[admission.profileId].seq + 1, world: playerView(admission.profileId) };
  }
  function connect(ticket, requiredAccountKey = '') {
    const work = queue.then(() => doConnect(ticket, requiredAccountKey)); queue = work.catch(() => {}); return work;
  }
  function client(req) {
    prune(); const raw = /^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization || '')?.[1];
    const c = raw && clients.get(hash(raw)); M.assert(c, 'Sign in again to reconnect to shared Visitor.'); return c;
  }
  function validateAction(action) {
    M.assert(M.plain(action), 'Invalid game intent.');
    const fields = { sync: ['type', 'frame', 'active'], claim: ['type', 'camp', 'corporation'], build: ['type', 'camp', 'kind', 'x', 'z', 'facility'],
      store: ['type', 'camp', 'facility'], move: ['type', 'camp', 'x', 'z'], stop: ['type', 'camp'], jump: ['type', 'camp'], enter: ['type', 'camp'], exit: ['type', 'camp'] }[action.type];
    M.assert(fields && Object.keys(action).every(k => fields.includes(k)), 'Only game intents are accepted; reports and awards cannot be submitted.');
    if (action.type === 'sync') M.assert(M.integer(action.frame) && typeof action.active === 'boolean', 'Invalid snapshot acknowledgement.');
    else {
      M.assert(M.integer(action.camp, 1) && action.camp <= 2500, 'Invalid camp.');
      if (action.type === 'claim') M.assert(['bruteforce', 'toyco', 'extreme', 'infrastruct'].includes(action.corporation), 'Invalid corporation.');
      if (action.type === 'build') M.assert(['nc', 'well'].includes(action.kind), 'This slice supports Nerve Centers and Transium wells.');
      if (['move', 'build'].includes(action.type)) M.assert(['x', 'z'].every(k => typeof action[k] === 'number' && Number.isFinite(action[k]) && Math.abs(action[k]) <= (action.type === 'move' ? 1 : 100)), 'Invalid intent coordinates.');
      if (['store', 'build'].includes(action.type)) M.assert(action.facility === undefined || M.integer(action.facility), 'Invalid facility.');
    }
  }
  async function input(c, envelope) {
    M.assert(M.plain(envelope) && Object.keys(envelope).every(k => ['seq', 'action'].includes(k)) && M.integer(envelope.seq, 1), 'Invalid ordered input.');
    validateAction(envelope.action);
    const operation = async () => {
      M.assert(accountActive(c.accountKey) && c.expires > now(), 'Sign in again to reconnect.');
      M.assert([...clients.values()].includes(c), 'That client was replaced by a reconnect.');
      // Remote execute starts/checks its worker and returns a bound current world.
      // Avoid extra snapshot round trips before and after every ordered input.
      if(!authority.remote)await start();
      const member = data.members[c.profileId], digest = hash(M.canonical(envelope));
      if (envelope.seq === member.seq && digest === member.digest) { if(authority.remote)await refresh();settle(); return { ...member.result, retry: true, world: playerView(c.profileId) }; }
      M.assert(envelope.seq === member.seq + 1, 'Stale, conflicting or out-of-order game input.');
      const action = envelope.action, next = structuredClone(data), m = next.members[c.profileId];
      let result = { ok: true, seq: envelope.seq }, checkpoint;
      if (authority.remote) {
        if (m.pending) M.assert(m.pending.digest === digest && m.pending.seq === envelope.seq, 'An earlier authority input must be reconciled first.');
        else { m.pending = { seq: envelope.seq, digest, action }; persist(next); }
        let receipt;
        try { receipt = await authority.execute({ profile_id: c.profileId, session_id: m.session_id, generation: c.generation, seq: envelope.seq, action }); }
        catch (cause) {
          if (cause.definitive) { const rejected = structuredClone(data); delete rejected.members[c.profileId].pending; persist(rejected); }
          throw cause;
        }
        const confirmed = structuredClone(data); applyReceipt(confirmed, c.profileId, receipt); persist(confirmed);
        const current=authority.read();view=current.view;latestCheckpoint=current.checkpoint;
        M.assert(view,'The authority receipt has no current world.');result = data.members[c.profileId].result;
        activity.set(c.profileId, { time: now(), active: receipt.entered });
      } else if (action.type === 'sync') {
        M.assert(action.frame <= view.frame && action.frame > (activity.get(c.profileId)?.frame ?? -1), 'Snapshot acknowledgement was replayed or forged.');
        const previous = activity.get(c.profileId), time = now();
        if (action.active) {
          m.entered = true;
          if (previous?.active && time >= previous.time && time - previous.time <= 5) m.active_seconds += time - previous.time;
        }
        // Commit the receipt before marking this frame observed, so failed writes can retry.
        next.checkpoint = latestCheckpoint;
        m.seq = envelope.seq; m.digest = digest; m.result = result; persist(next);
        activity.set(c.profileId, { frame: action.frame, time, active: action.active });
      } else {
        let response;
        try { response = await authority.command({ profile_id: c.profileId, action }); }
        catch (cause) { fail('Shared authority did not confirm the input. Reconnect to retry.'); throw cause; }
        checkpoint = response.checkpoint; next.checkpoint = checkpoint; await refresh();
        result = { ok: !response.error, error: response.error || '', seq: envelope.seq };
        m.seq = envelope.seq; m.digest = digest; m.result = result;
        try { persist(next); }
        catch (cause) {
          // Roll back to the last durable world before accepting any further intent.
          fail('Shared Visitor checkpoint could not be saved. Reconnect to retry.'); throw cause;
        }
      }
      settle(); return { ...result, world: playerView(c.profileId) };
    };
    const work = queue.then(operation).catch(cause => {
      const member = data.members[c.profileId], digest = hash(M.canonical(envelope));
      if ((member?.pending?.digest === digest || (member?.seq === envelope.seq && member?.digest === digest)) && !cause.definitive) cause.retryable = true;
      throw cause;
    }); queue = work.catch(() => {}); return work;
  }
  async function state(c) { await start(); M.assert(view, error || 'Shared Visitor is starting.'); settle(); return { ok: true, profile_id: c.profileId, next_seq: data.members[c.profileId].seq + 1, world: playerView(c.profileId) }; }
  function disconnect(req) { const c = client(req); for (const [key, item] of clients) if (item === c) clients.delete(key); activity.delete(c.profileId); return { ok: true }; }
  function status(profileId) { prune(); return { available, authority: KIND, error, joined: [...clients.values()].some(c => c.profileId === profileId && now() - (activity.get(profileId)?.time || 0) <= 5), world_id: authority.worldId || 'visitor-loopback-v1', transport: authority.remote ? 'mtls-proxy' : 'loopback' }; }
  function release(profileId,accountKey){if(!accountKey)return;for(const[key,c]of clients)if(c.profileId===profileId&&c.accountKey===accountKey)clients.delete(key);for(const[key,t]of tickets)if(t.profileId===profileId&&t.accountKey===accountKey)tickets.delete(key);if(![...clients.values()].some(c=>c.profileId===profileId))activity.delete(profileId);}
  function connectedProfiles(){prune();return [...new Set([...clients.values()].map(c=>c.profileId))];}
  function connected(id,key=''){prune();return [...clients.values()].some(c=>c.profileId===id&&(!key||c.accountKey===key));}
  function close() { authority.close(); }
  return { issue, connect, client, input, state, status, settle, disconnect, close, connected, connectedProfiles, release, async ready() { try { await start(); return true; } catch { return false; } } };
}
module.exports = { createMultiplayer, validate, KIND };

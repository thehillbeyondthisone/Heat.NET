'use strict';
// Standalone gameplay host. No HEAT accounts, cookies, passwords, Degrees or trophies.
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const C = require('./authority-contract.cjs');
const { createGodotAuthority } = require('./godot-authority.cjs');
function validate(data, worldId) {
  C.assert(C.plain(data) && data.version === 1 && data.world_id === worldId && C.plain(data.checkpoint) && C.plain(data.sessions), 'Authority state needs recovery.');
  for (const [id, member] of Object.entries(data.sessions)) C.assert(C.SESSION.test(id) && C.PROFILE.test(member.profile_id) &&
    C.integer(member.seq) && C.integer(member.admission_seq, 1) && C.HEX.test(member.generation) &&
    Number.isFinite(member.active_seconds) && member.active_seconds >= 0 && typeof member.entered === 'boolean', 'Invalid authority participation record.');
  return data;
}
function createAuthorityHost({ gameRoot, stateDir, worldId, tls, toastSpki, now = () => performance.now() / 1000, spawnAuthority }) {
  C.assert(/^[a-z0-9][a-z0-9-]{2,63}$/.test(worldId || '') && C.HEX.test(toastSpki || ''), 'Explicit world identity and Toast public-key pin are required.');
  C.assert(tls?.ca && tls.cert && tls.key, 'Mutual TLS CA/certificate/key are required.');
  const file = path.join(path.resolve(stateDir), 'authority-world.json');
  let data = fs.existsSync(file) ? validate(JSON.parse(fs.readFileSync(file, 'utf8')), worldId) : { version: 1, world_id: worldId, checkpoint: {}, sessions: {} };
  let queue = Promise.resolve();
  const activity = new Map();
  const worker = createGodotAuthority({ gameRoot, spawnAuthority });
  function persist(next) {
    validate(next, worldId); fs.mkdirSync(path.dirname(file), { recursive: true });
    const temp = file + '.' + crypto.randomBytes(8).toString('hex') + '.tmp';
    try {
      const json = JSON.stringify(next); C.assert(Buffer.byteLength(json) <= 16 * 1024 * 1024, 'Authority checkpoint exceeds its limit.');
      require('./checked-json.cjs').writeCheckedJSON(temp,json+'\n',data=>validate(data,worldId));
      if (fs.existsSync(file)) fs.copyFileSync(file, file + '.bak');
      fs.renameSync(temp, file); data = next;
    } finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
  }
  async function read() {
    await worker.start(data.checkpoint); const result = worker.read();
    C.assert(result.view, 'Authority is unavailable.'); return { ...result.view, world_id: worldId };
  }
  async function operation(name, payload) {
    if (name === 'snapshot') { C.assert(C.exact(payload, ['world_id']) && payload.world_id === worldId, 'Wrong world binding.'); return { world: await read() }; }
    C.binding(payload); C.assert(payload.world_id === worldId, 'Wrong world binding.');
    if (name === 'admit') {
      C.assert(C.exact(payload, ['world_id', 'profile_id', 'session_id', 'generation', 'admission_seq', 'next_seq']) &&
        C.integer(payload.next_seq, 1) && C.integer(payload.admission_seq, 1), 'Invalid admission.');
      const previous = data.sessions[payload.session_id];
      if (previous) {
        C.assert(previous.profile_id === payload.profile_id, 'Admission owner conflict.');
        C.assert(payload.next_seq === previous.seq + 1 || payload.next_seq === previous.seq, 'HEAT/authority sequence requires reconciliation.');
        if (payload.admission_seq === previous.admission_seq) C.assert(payload.generation === previous.generation, 'Admission generation conflict.');
        else C.assert(payload.admission_seq === previous.admission_seq + 1, 'Replayed or out-of-order admission.');
      } else {
        C.assert(Object.keys(data.sessions).length < 4096 && payload.admission_seq === 1, 'Authority session admission limit or sequence conflict.');
      }
      const next = structuredClone(data);
      next.sessions[payload.session_id] = { ...(previous || { profile_id: payload.profile_id, seq: payload.next_seq - 1, active_seconds: 0, entered: false }),
        admission_seq: payload.admission_seq, generation: payload.generation };
      persist(next); activity.delete(payload.session_id);
      return { world: await read(), next_seq: next.sessions[payload.session_id].seq + 1 };
    }
    C.assert(name === 'input' && C.exact(payload, ['world_id', 'profile_id', 'session_id', 'generation', 'seq', 'action']) && C.integer(payload.seq, 1), 'Invalid authority operation.');
    C.action(payload.action);
    const member = data.sessions[payload.session_id];
    C.assert(member && member.profile_id === payload.profile_id && member.generation === payload.generation, 'An active HEAT admission is required.');
    const digest = C.digest({ profile_id: payload.profile_id, session_id: payload.session_id, seq: payload.seq, action: payload.action });
    if (payload.seq === member.seq && member.digest === digest) {
      // A saved receipt remains committed even if the worker cannot restart for a fresh view.
      // Return that receipt so HEAT retains/reconciles the input instead of clearing it as rejected.
      const receipt = { ...member.result, retry: true };
      try { receipt.world = await read(); } catch { /* The next snapshot can retry startup. */ }
      return receipt;
    }
    C.assert(payload.seq === member.seq + 1, 'Replayed, conflicting or out-of-order authority input.');
    const world = await read(), next = structuredClone(data), updated = next.sessions[payload.session_id];
    let result = { ok: true, error: '', seq: payload.seq }, sample;
    if (payload.action.type === 'sync') {
      const previous = activity.get(payload.session_id), frame = payload.action.frame, time = now();
      // Retain the previous two-second acknowledgement window at the advertised
      // publication rate. The original eight-frame bound assumed 4 Hz snapshots.
      const frameWindow=2*Math.min(30,Math.max(4,Number(world.snapshot_hz)||4));
      C.assert(frame <= world.frame && frame > (previous?.frame ?? -1) && world.frame - frame <= frameWindow, 'Stale, replayed or forged authority frame.');
      if (payload.action.active) {
        updated.entered = true;
        if (previous?.active && time >= previous.time && time - previous.time <= 5) updated.active_seconds += time - previous.time;
      }
      sample = { frame, time, active: payload.action.active };
    } else {
      try {
        const response = await worker.command({ profile_id: payload.profile_id, action: payload.action });
        result.ok = !response.error; result.error = response.error || '';
      } catch (error) { worker.reset(); throw error; }
    }
    next.checkpoint = worker.read().checkpoint;
    updated.seq = payload.seq; updated.digest = digest;
    updated.result = { ...result, protocol: C.PROTOCOL, world_id: worldId, profile_id: payload.profile_id, session_id: payload.session_id,
      action_digest: digest, entered: updated.entered, active_seconds: updated.active_seconds };
    try { persist(next); } catch (error) { worker.reset(); throw error; }
    if (sample) activity.set(payload.session_id, sample);
    return { ...updated.result, world: { ...worker.read().view, world_id: worldId } };
  }
  const server = https.createServer({ ca: tls.ca, cert: tls.cert, key: tls.key, requestCert: true, rejectUnauthorized: true,
    minVersion: 'TLSv1.3', maxVersion: 'TLSv1.3', maxHeaderSize: 8192 }, async (req, res) => {
    const respond = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
    try {
      C.assert(req.socket.authorized && C.spki(req.socket.getPeerCertificate().raw) === toastSpki, 'Unrecognized HEAT identity authority certificate.');
      C.assert(req.method === 'POST' && req.url === '/v1/authority' && /^application\/json(?:;|$)/i.test(req.headers['content-type'] || ''), 'Unsupported authority request.');
      let bytes = 0, chunks = [];
      for await (const chunk of req) { bytes += chunk.length; C.assert(bytes <= 16384, 'Authority request exceeds its limit.'); chunks.push(chunk); }
      const input = JSON.parse(Buffer.concat(chunks));
      C.assert(C.exact(input, ['protocol', 'request_id', 'operation', 'payload']) && input.protocol === C.PROTOCOL && C.HEX.test(input.request_id), 'Unsupported authority protocol.');
      const task = queue.then(() => operation(input.operation, input.payload)); queue = task.catch(() => {});
      respond(200, { protocol: C.PROTOCOL, request_id: input.request_id, result: await task });
    } catch (error) { respond(400, { rejected: true, error: error.code ? 'Authority request could not be committed.' : error.message }); }
  });
  server.headersTimeout = 10000; server.requestTimeout = 10000;
  server.on('tlsClientError', () => {}); server.once('close', () => worker.close());
  return { server, close: () => new Promise(resolve => server.close(resolve)), worldId, stateFile: file };
}
module.exports = { createAuthorityHost };

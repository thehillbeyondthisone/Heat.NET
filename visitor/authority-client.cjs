'use strict';
const https = require('node:https');
const tls = require('node:tls');
const fs = require('node:fs');
const crypto = require('node:crypto');
const C = require('./authority-contract.cjs');
function validateConfig(config) {
  C.assert(C.exact(config, ['endpoint', 'world_id', 'server_spki', 'ca', 'cert', 'key']), 'Explicit remote authority endpoint, world and mutual TLS material are required.');
  const endpoint = new URL(config.endpoint);
  C.assert(endpoint.protocol === 'https:' && !endpoint.username && !endpoint.password && !endpoint.search && !endpoint.hash && endpoint.pathname === '/', 'Use one HTTPS authority origin.');
  C.assert(/^[a-z0-9][a-z0-9-]{2,63}$/.test(config.world_id || '') && C.HEX.test(config.server_spki || '') && config.ca && config.cert && config.key, 'Incomplete remote authority trust configuration.');
  return endpoint;
}
function loadConfig(file) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  C.assert(C.exact(raw, ['endpoint', 'world_id', 'server_spki', 'ca_file', 'cert_file', 'key_file']), 'Invalid remote configuration file.');
  for (const key of ['ca_file', 'cert_file', 'key_file']) C.assert(typeof raw[key] === 'string' && require('node:path').isAbsolute(raw[key]), 'TLS files must use explicit absolute paths.');
  const config = { endpoint: raw.endpoint, world_id: raw.world_id, server_spki: raw.server_spki,
    ca: fs.readFileSync(raw.ca_file), cert: fs.readFileSync(raw.cert_file), key: fs.readFileSync(raw.key_file) };
  validateConfig(config); return config;
}
function createRemoteAuthority(config) {
  const endpoint = validateConfig(config);
  let latest = null, closed = false;
  const agent = new https.Agent({ ca: config.ca, cert: config.cert, key: config.key, minVersion: 'TLSv1.3', maxVersion: 'TLSv1.3',
    rejectUnauthorized: true, keepAlive: true, maxFreeSockets: 2, scheduling: 'lifo', maxSockets: 4, maxCachedSessions: 0,
    checkServerIdentity(hostname, cert) {
      const hostnameError = tls.checkServerIdentity(hostname, cert); if (hostnameError) return hostnameError;
      if (C.spki(cert.raw) !== config.server_spki) return new Error('Authority public-key pin mismatch.');
    } });
  function call(operation, payload) {
    C.assert(!closed, 'Remote authority adapter is closed.');
    const requestId = crypto.randomBytes(32).toString('hex');
    const body = JSON.stringify({ protocol: C.PROTOCOL, request_id: requestId, operation, payload: { world_id: config.world_id, ...payload } });
    return new Promise((resolve, reject) => {
      const req = https.request(new URL('/v1/authority', endpoint), { method: 'POST', agent, timeout: 12000,
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, res => {
        let bytes = 0, chunks = [];
        res.on('data', chunk => { bytes += chunk.length; if (bytes > 16 * 1024 * 1024) { res.destroy(new Error('Authority response exceeds its limit.')); return; } chunks.push(chunk); });
        res.on('error', reject);
        res.on('end', () => {
          try {
            const message = JSON.parse(Buffer.concat(chunks));
            if (res.statusCode !== 200) { const error = new Error(message.error || 'Remote authority rejected the operation.'); error.definitive = message.rejected === true; throw error; }
            C.assert(message.protocol === C.PROTOCOL && message.request_id === requestId && C.plain(message.result), 'Authority response binding failed.');
            if (message.result.world) { C.assert(message.result.world.world_id === config.world_id, 'Wrong authority world.'); latest = message.result.world; }
            resolve(message.result);
          } catch (error) { if (!error.definitive) error.retryable = true; reject(error); }
        });
      }); req.on('timeout', () => req.destroy(new Error('Remote authority timed out; retry the same input.')));
      req.on('error', error => { error.retryable = true; reject(error); }); req.end(body);
    });
  }
  return { available: true, remote: true, worldId: config.world_id,
    start: async () => { if(!latest)await call('snapshot', {}); },
    admit: binding => call('admit', binding),
    async execute(input) {
      const receipt = await call('input', input);
      const digest = C.digest({ profile_id: input.profile_id, session_id: input.session_id, seq: input.seq, action: input.action });
      C.assert(receipt.protocol === C.PROTOCOL && receipt.world_id === config.world_id && receipt.profile_id === input.profile_id &&
        receipt.session_id === input.session_id && receipt.seq === input.seq && receipt.action_digest === digest &&
        Number.isFinite(receipt.active_seconds) && receipt.active_seconds >= 0 && typeof receipt.entered === 'boolean', 'Authority participation receipt binding failed.');
      return receipt;
    },
    refresh: async () => { await call('snapshot', {}); return { view: latest, checkpoint: {} }; },
    read: () => ({ view: latest, checkpoint: {} }), reset: () => { latest = null; }, close: () => { closed = true; agent.destroy(); },
  };
}
module.exports = { createRemoteAuthority, loadConfig, validateConfig };

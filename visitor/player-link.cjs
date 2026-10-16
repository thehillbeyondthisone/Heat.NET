'use strict';
const https = require('node:https');
const tls = require('node:tls');
const crypto = require('node:crypto');
const C = require('./authority-contract.cjs');
const { PROTOCOL } = require('./player-gateway.cjs');
function createPlayerLink(config) {
  C.assert(C.exact(config, ['endpoint', 'world_id', 'server_spki', 'ca']), 'A player link uses public trust only; broker certificates/keys are not accepted.');
  const endpoint = new URL(config.endpoint);
  C.assert(endpoint.protocol === 'https:' && endpoint.pathname === '/' && !endpoint.username && !endpoint.password && !endpoint.search && !endpoint.hash && C.HEX.test(config.server_spki) && /^[a-z0-9][a-z0-9-]{2,63}$/.test(config.world_id) && config.ca, 'Invalid secure player endpoint/trust.');
  C.assert(!Buffer.from(config.ca).includes('PRIVATE KEY'), 'Player trust contains private key material.');
  let cookie = '', closed = false;
  const agent = new https.Agent({ ca: config.ca, rejectUnauthorized: true, minVersion: 'TLSv1.3', maxVersion: 'TLSv1.3', maxCachedSessions: 0, keepAlive: true, maxFreeSockets: 2, scheduling: 'lifo', maxSockets: 4,
    checkServerIdentity(hostname, cert) { const error = tls.checkServerIdentity(hostname, cert); if (error) return error; if (C.spki(cert.raw) !== config.server_spki) return new Error('HEAT player certificate pin mismatch.'); } });
  function call(operation, data = {}, bearer = '') {
    C.assert(!closed && /^[a-z]+$/.test(operation), 'Player link is closed or invalid.');
    const requestId = crypto.randomBytes(32).toString('hex'), body = JSON.stringify({ world_id: config.world_id, request_id: requestId, data });
    return new Promise((resolve, reject) => {
      const req = https.request(new URL('/api/player/v1/' + operation, endpoint), { method: 'POST', agent, timeout: 12000,
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), ...(cookie ? { Cookie: cookie } : {}), ...(bearer ? { Authorization: 'Bearer ' + bearer } : {}) } }, res => {
        let size = 0; const chunks = [];
        res.on('data', chunk => { size += chunk.length; if (size > 16 * 1024 * 1024) res.destroy(new Error('Player response exceeds its limit.')); else chunks.push(chunk); });
        res.on('error', reject); res.on('end', () => {
          try {
            const value = JSON.parse(Buffer.concat(chunks));
            C.assert(value.protocol === PROTOCOL && value.world_id === config.world_id && value.request_id === requestId && C.plain(value.data), 'Player response/world binding failed.');
            if (value.data.world) C.assert(value.data.world.world_id === config.world_id, 'Player snapshot/world binding failed.');
            if (res.statusCode !== 200) { if (res.statusCode === 401) cookie = ''; const error = new Error(value.data.error || 'HEAT rejected the player request.'); error.playerStatus = res.statusCode; throw error; }
            if (operation === 'login') {
              const received = (res.headers['set-cookie'] || []).find(item => /^heat_session=[a-f0-9]{64};/.test(item));
              C.assert(received && /; Secure(?:;|$)/.test(received) && /; HttpOnly(?:;|$)/.test(received), 'Secure HEAT session cookie is required.'); cookie = received.split(';')[0];
            }
            if (operation === 'logout') cookie = '';
            resolve(value.data);
          } catch (error) { reject(error); }
        });
      }); req.on('timeout', () => req.destroy(new Error('HEAT player connection timed out; retry the same input.'))); req.on('error', reject); req.end(body);
    });
  }
  return { call, get signedIn() { return Boolean(cookie); }, close() { cookie = ''; closed = true; agent.destroy(); } };
}
module.exports = { createPlayerLink };

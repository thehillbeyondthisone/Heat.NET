'use strict';
// Player TLS terminates at the single HEAT owner. Players never receive authority mTLS keys.
const https = require('node:https');
const C = require('./authority-contract.cjs');
const PROTOCOL = '10six-player-https-v1';
function createPlayerGateway({ bridge, worldId, tls }) {
  C.assert(bridge?.playerRequest && /^[a-z0-9][a-z0-9-]{2,63}$/.test(worldId || '') && tls?.cert && tls.key, 'Explicit player TLS/world configuration is required.');
  let inFlight = 0, authInFlight = 0;
  const server = https.createServer({ cert: tls.cert, key: tls.key, minVersion: 'TLSv1.3', maxVersion: 'TLSv1.3', maxHeaderSize: 8192 }, async (req, res) => {
    let admitted = false, authenticating = false, requestId;
    const reply = (status, data) => { if (res.destroyed) return; res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify({ protocol: PROTOCOL, world_id: worldId, request_id: requestId, data })); };
    try {
      C.assert(req.socket.encrypted && req.method === 'POST' && /^\/api\/player\/v1\/[a-z]+$/.test(req.url || ''), 'Use the secure player API.');
      C.assert(!req.headers.origin || req.headers.origin === 'https://' + req.headers.host, 'Use the same secure HEAT address.');
      C.assert(/^application\/json(?:;|$)/i.test(req.headers['content-type'] || ''), 'Use JSON.');
      C.assert(inFlight < 32, 'Player requests are busy; retry shortly.'); inFlight++; admitted = true;
      let size = 0; const chunks = [];
      for await (const chunk of req) { size += chunk.length; C.assert(size <= 16384, 'Player request exceeds its limit.'); chunks.push(chunk); }
      const envelope = JSON.parse(Buffer.concat(chunks));
      C.assert(C.exact(envelope, ['world_id', 'request_id', 'data']) && envelope.world_id === worldId && C.HEX.test(envelope.request_id) && C.plain(envelope.data), 'Invalid player/world binding.');
      requestId = envelope.request_id; const operation = req.url.split('/').pop();
      if (operation === 'login') { C.assert(authInFlight < 4, 'Sign-in is busy; retry shortly.'); authInFlight++; authenticating = true; }
      const data = await bridge.playerRequest(req, res, operation, envelope.data, worldId); reply(200, data);
    } catch (error) { reply(error.playerStatus || (error.code || error.retryable ? 503 : 400), { error: error.code ? 'HEAT could not complete the request. Retry or reconnect.' : error instanceof SyntaxError ? 'Invalid player JSON.' : error.message }); }
    finally { if (admitted) inFlight--; if (authenticating) authInFlight--; }
  });
  server.headersTimeout = 10000; server.requestTimeout = 15000; server.maxConnections = 64; server.maxRequestsPerSocket = 128;
  server.on('tlsClientError', () => {});
  return { server, worldId, close: () => new Promise(resolve => server.close(resolve)) };
}
module.exports = { createPlayerGateway, PROTOCOL };

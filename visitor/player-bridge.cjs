'use strict';
// Per-PC untrusted loopback transport. Native bearer is local; authority bearer never leaves this bridge.
const http = require('node:http'), crypto = require('node:crypto');
const C = require('./authority-contract.cjs');
const { createPlayerLink } = require('./player-link.cjs');
const PLAY_LIMIT = 8 * 3600, RENEW_MARGIN = 60;
function createPlayerBridge({ trust, now = () => Date.now() / 1000, clientUI }) {
  const link = createPlayerLink(trust);
  let ticket, remoteTicket, expires = 0, token = '', remoteToken = '', remoteExpires = 0, playExpires = 0, profile = '', pending = 0, closed = false, authError = '';
  let queue = Promise.resolve();
  function serialized(operation) { const work = queue.then(operation); queue = work.catch(() => {}); return work; }
  function clearGame() { ticket = ''; remoteTicket = ''; token = ''; remoteToken = ''; remoteExpires = 0; playExpires = 0; profile = ''; }
  function endAuthentication(message, status = 401) { authError = message; const error = new Error(message); error.playerStatus = status; throw error; }
  async function renew() {
    if (playExpires <= now()) endAuthentication('This play session reached its eight-hour limit. Stop the game, then click Play for a new session.');
    if (remoteExpires > now() + RENEW_MARGIN) return;
    const admission = await link.call('admission'), joined = await link.call('connect', { ticket: admission.ticket });
    if (joined.profile_id !== profile) endAuthentication('The HEAT account changed. Stop the game and sign in again.', 403);
    C.assert(C.HEX.test(joined.token) && joined.expires_unix > now() && joined.expires_unix <= now() + 901, 'Invalid renewed player admission.');
    remoteToken = joined.token; remoteExpires = joined.expires_unix;
  }
  const server = http.createServer(async (req, res) => {
    const reply = (status, value) => { if (res.destroyed) return; res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
    let admitted = false;
    try {
      if(ui&&await ui.handle(req,res,server.address().port))return;
      C.assert(!closed && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress), 'Native bridge is loopback only.');
      C.assert(req.headers.host === '127.0.0.1:' + server.address().port && !req.headers.origin, 'Use the native bridge. Browser requests are not supported.');
      C.assert(pending < 4, 'Native bridge is busy.'); pending++; admitted = true;
      const operation = /^\/api\/visitor\/multiplayer\/(connect|state|input|disconnect)$/.exec(req.url || '')?.[1];
      C.assert(operation && req.method === (operation === 'state' ? 'GET' : 'POST'), 'Unsupported native player route.');
      let input = {};
      if (req.method === 'POST') {
        C.assert(/^application\/json(?:;|$)/i.test(req.headers['content-type'] || ''), 'Use native JSON.');
        let size = 0; const chunks = []; for await (const chunk of req) { size += chunk.length; C.assert(size <= 16384, 'Native request exceeds its limit.'); chunks.push(chunk); }
        input = JSON.parse(Buffer.concat(chunks)); C.assert(C.plain(input), 'Invalid native request.');
      }
      const result = await serialized(async () => {
        C.assert(!closed, 'Native bridge is closed.');
        if (operation === 'connect') {
          C.assert(C.exact(input, ['ticket']) && ticket && input.ticket === ticket && expires > now(), 'Local admission expired or already used.');
          ticket = ''; const remote = remoteTicket; remoteTicket = ''; const joined = await link.call('connect', { ticket: remote });
          C.assert(C.HEX.test(joined.token) && joined.expires_unix > now(), 'Invalid player admission.');
          remoteToken = joined.token; remoteExpires = joined.expires_unix; token = crypto.randomBytes(32).toString('hex'); playExpires = now() + PLAY_LIMIT; profile = joined.profile_id; authError = '';
          return { ...joined, token, expires_unix: playExpires };
        }
        const bearer = /^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization || '')?.[1]; C.assert(token && bearer === token, authError || 'Reconnect through Play 10Six.');
        if (operation === 'disconnect') { C.assert(C.exact(input, []), 'Disconnect has no report fields.'); try { return await link.call('disconnect', {}, remoteToken); } finally { clearGame(); } }
        await renew(); return link.call(operation, input, remoteToken);
      });
      reply(200, result);
    } catch (error) {
      if (error.playerStatus === 401 || error.playerStatus === 403) { authError = authError || 'Your HEAT sign-in ended. Stop the game and sign in again.'; token = ''; remoteToken = ''; }
      reply(error.playerStatus || (error.code || /timed out/.test(error.message) ? 503 : 400), { error: error.playerStatus === 401 || error.playerStatus === 403 ? authError : error.code ? 'Secure HEAT connection unavailable. Retry the same input.' : error.message });
    } finally { if (admitted) pending--; }
  });
  server.headersTimeout = 10000; server.requestTimeout = 15000; server.maxConnections = 16;
  async function admission(generation) { return serialized(async () => {
    if (expires <= now()) { ticket = ''; remoteTicket = ''; }
    C.assert(!token && !ticket, 'Close the existing game before starting another.');
    const result = generation===undefined?await link.call('admission'):await link.call('room',{action:'admission',data:{generation}}); remoteTicket = result.ticket; expires = Math.min(result.expires_unix, now() + 30); ticket = crypto.randomBytes(32).toString('hex'); return ticket;
  }); }
  async function stopGame(){return serialized(async()=>{ticket='';remoteTicket='';try{if(remoteToken)await link.call('disconnect',{},remoteToken);}finally{clearGame();}});}
  const ui=clientUI?require('./player-client.cjs').createPlayerClient({link,admission,stopGame,...clientUI}):null;
  return { server, link, admission, get clientActiveGame(){return Boolean(ui?.running);},get clientAccount(){return ui?.account||null;}, get authError() { return authError; }, clearAuthError() { authError = ''; },
    stopGame,
    async close() { if (closed) return; if(ui)await ui.close();closed = true; await queue; clearGame(); try { if (link.signedIn) await link.call('logout'); } catch { /* Discard local secrets; remote account TTL is unchanged. */ } link.close(); if (server.listening) await new Promise(resolve => server.close(resolve)); }
  };
}
module.exports = { createPlayerBridge, PLAY_LIMIT, RENEW_MARGIN };

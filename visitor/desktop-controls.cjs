'use strict';
// Portable desktop backend: private stdio control channel, no local control HTTP/admin listener.
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const C = require('./authority-contract.cjs');
const Config = require('./controls-config.cjs');
const { createPlayerBridge } = require('./player-bridge.cjs');
function createDesktopControls(config, { spawnGame = spawn } = {}) {
  let service, player, game, account = null, closed = false, lastError = '';
  const owned = new Set();
  const result = message => { if (player && !player.link.signedIn) account = null; return ({ ok: true, message, role: config.role, service_running: Boolean(service), game_running: Boolean(game || player?.clientActiveGame || service?.bridge?.clientActiveGames()), signed_in: Boolean(account), account: account && { username: account.username, profile_id: account.profile_id } }); };
  async function ensurePlayer() {
    if (player) return;
    player = createPlayerBridge({ trust: Config.loadPlayerConfig(config.playerConfigFile), clientUI:{root:path.resolve(__dirname,'..'),gameRoot:config.gameRoot,spawnGame} });
    try { await new Promise((resolve, reject) => { player.server.once('error', reject); player.server.listen(0, '127.0.0.1', resolve); }); }
    catch (error) { await player.close(); player = null; throw error; }
  }
  async function stopGame() {
    const previous = game; game = null; if (previous && owned.has(previous)) { previous.kill(); owned.delete(previous); }
    if (player) { try { await player.stopGame(); } catch { /* An unreachable peer cannot keep a local game alive. */ } }
  }
  async function stopService() { const previous = service; service = null; if (previous) await previous.close(); }
  async function command(operation, data = {}) {
    C.assert(!closed && C.plain(data), 'Desktop controls are closed or invalid.');
    const empty = () => C.assert(Object.keys(data).length === 0, 'Unexpected desktop command fields.');
    if (operation === 'status') { empty(); return result(player?.authError || lastError || (service ? 'Service running.' : account ? 'Signed in. Ready to play.' : 'Ready to sign in.')); }
    if(operation==='client'){empty();if(config.role==='toast'){if(!service)await command('start');return{...result('HEAT client ready.'),client_url:service.loopback+'/site/client/index.html'};}await ensurePlayer();return{...result('HEAT player client ready.'),client_url:'http://127.0.0.1:'+player.server.address().port+'/site/client/index.html'};}
    if (operation === 'check') {
      empty(); await ensurePlayer(); const health = await player.link.call('health');
      C.assert(health.ready, 'HEAT is reachable; gameplay server is unavailable. Start Server on Harbinger.');
      lastError = ''; return result('Secure HEAT and gameplay server are ready.');
    }
    if (operation === 'summary') { empty(); C.assert(account, 'Sign in first.'); return { ...result('HEAT account awards refreshed.'), summary: await player.link.call('summary') }; }
    if (operation === 'start') {
      empty(); C.assert(config.role !== 'player', 'This PC is configured as a player only.'); if (service) return result('Service already running.');
      if (config.role === 'authority') {
        const options = require('./deployment-config.cjs').loadHostConfig(config.serviceConfigFile, config.networkApproved);
        Config.leaf(options.tls.cert, 1);
        const release = require('./desktop-state.cjs').acquire(options.stateDir, 'authority', options.worldId);
        let host;
        try { host = require('./authority-host.cjs').createAuthorityHost(options); } catch (error) { release(); throw error; }
        try { await new Promise((resolve, reject) => { host.server.once('error', reject); host.server.listen(options.port, options.bind, resolve); }); }
        catch (error) { await host.close(); release(); throw error; } service = { close: async () => { try { await host.close(); } finally { release(); } } };
        return result('Gameplay server started at ' + options.bind + ':' + options.port + '.');
      }
      const options = Config.loadToastService(config.serviceConfigFile, config.networkApproved);
      const release = require('./desktop-state.cjs').acquire(options.stateDir, 'toast', options.listener.worldId);
      let bridge, gateway;
      try {
        bridge = require('./server.cjs').createVisitorServer({ ...options, clientEnabled: true, allowedHosts: [] });
        gateway = require('./player-gateway.cjs').createPlayerGateway({ bridge, ...options.listener });
      } catch (error) { if (bridge) await new Promise(resolve => bridge.server.close(resolve)); release(); throw error; }
      try {
        await new Promise((resolve, reject) => { bridge.server.once('error', reject); bridge.server.listen(options.port, '127.0.0.1', resolve); });
        await new Promise((resolve, reject) => { gateway.server.once('error', reject); gateway.server.listen(options.listener.port, options.listener.bind, resolve); });
      } catch (error) { await gateway.close(); await new Promise(resolve => bridge.server.close(resolve)); release(); throw error; }
      service = { close: async () => { try { await gateway.close(); await new Promise(resolve => bridge.server.close(resolve)); } finally { release(); } }, bridge, loopback: 'http://127.0.0.1:' + options.port };
      return result('HEAT identity service and secure player gateway started.');
    }
    if (operation === 'register') {
      C.assert(config.role === 'toast' && service?.loopback && !game, 'Create accounts on the Toast HEAT owner while its service is running.');
      C.assert(C.exact(data, ['username', 'password', 'display_name']), 'Use username, password and display name.');
      const res = await fetch(service.loopback + '/api/visitor/auth/register', { method: 'POST', headers: { Origin: service.loopback, 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      const value = await res.json(); C.assert(res.status === 200, value.error || 'Could not create HEAT account.'); return result('HEAT account created. Sign in to play.');
    }
    if (operation === 'login') {
      C.assert(C.exact(data, ['username', 'password']) && !game && !player?.clientActiveGame, 'Close the game before changing account.'); await ensurePlayer();
      account = (await player.link.call('login', data)).account; player.clearAuthError(); return result('Signed in to HEAT.');
    }
    if (operation === 'play') {
      empty(); C.assert(account, 'Sign in to your HEAT account first.'); if (game) return result('10Six is already open.');
      const runtime = path.join(config.gameRoot, 'recovery/runtime/Godot.exe'); C.assert(fs.existsSync(runtime), 'The approved Godot runtime is not installed in this package.');
      const admission = await player.admission();
      try { game = spawnGame(runtime, ['--path', path.join(config.gameRoot, 'playable'), '--script', 'scripts/multiplayer_client.gd', '--',
        '--shared-url=http://127.0.0.1:' + player.server.address().port, '--shared-ticket=' + admission], { windowsHide: false, shell: false, stdio: 'ignore' }); }
      catch (error) { await player.stopGame(); throw error; }
      const launched = game; owned.add(launched);
      const exited = () => { owned.delete(launched); if (game === launched) { game = null; player.stopGame().catch(() => {}); } };
      launched.once('exit', exited); launched.once('error', () => { lastError = '10Six could not open. Check the prepared game runtime.'; exited(); });
      lastError = '';
      return result('10Six opens in its own window.');
    }
    if (operation === 'stopgame') { empty(); C.assert(!player?.clientActiveGame,'Close the active game window before changing its client.');await stopGame(); return result('Game stopped.'); }
    if (operation === 'logout') { empty(); C.assert(!player?.clientActiveGame,'Close the active game window before changing its client.');await stopGame(); if (player) { await player.close(); player = null; } account = null; return result('Signed out.'); }
    if (operation === 'stop') { empty(); C.assert(!service?.bridge?.clientActiveGames()&&!player?.clientActiveGame,'Close the active game before stopping its HEAT service.'); await stopGame(); if (player) { await player.close(); player = null; } account = null; await stopService(); return result('Owned game and service stopped.'); }
    throw new Error('Unknown desktop command.');
  }
  async function close() { if (closed) return; await command('stop'); closed = true; }
  return { command, close };
}
async function main() {
  const file = process.argv.slice(2).find(arg => arg.startsWith('--config='))?.slice(9);
  const config = Config.loadControlsConfig(file), controls = createDesktopControls(config);
  const readline = require('node:readline'); const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity }); let queued = 0, queue = Promise.resolve();
  function send(value) { process.stdout.write(JSON.stringify(value) + '\n'); }
  input.on('line', line => {
    if (Buffer.byteLength(line) > 16384 || queued >= 8) { send({ id: null, ok: false, message: 'Desktop requests are busy or too large.' }); return; }
    let request; try { request = JSON.parse(line); C.assert(C.exact(request, ['id', 'operation', 'data']) && C.integer(request.id) && typeof request.operation === 'string', 'Invalid desktop request.'); } catch { send({ id: null, ok: false, message: 'Invalid desktop request.' }); return; }
    queued++; queue = queue.then(async () => {
      try { if (request.operation === 'shutdown') { await controls.close(); send({ id: request.id, ok: true, message: 'Stopped.' }); input.close(); return; }
        send({ id: request.id, ...await controls.command(request.operation, request.data) }); }
      catch (error) { const state = await controls.command('status').catch(() => ({})); send({ ...state, id: request.id, ok: false, message: error.code ? 'Connection or prepared setup is unavailable. Check status/setup.' : error.message }); }
      finally { queued--; }
    });
  });
  input.once('close', () => { queue.finally(() => controls.close()).finally(() => process.exit(0)); });
}
if (require.main === module) main().catch(() => { process.stdout.write(JSON.stringify({ id: null, ok: false, message: 'Prepared configuration is missing or invalid. Choose the setup file.' }) + '\n'); process.exitCode = 1; });
module.exports = { createDesktopControls };

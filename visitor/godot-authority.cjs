'use strict';
// Private local worker transport, reused by loopback and the standalone authority host.
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
function createGodotAuthority({ gameRoot, spawnAuthority = spawn }) {
  let socket, listener, child, starting, stopped = false, error = '', view = null, checkpoint = {}, serial = 0;
  const pending = new Map();
  const available = Boolean(gameRoot && fs.existsSync(path.join(gameRoot, 'playable/scripts/multiplayer_authority.gd')) && fs.existsSync(path.join(gameRoot, 'recovery/runtime/Godot.exe')));
  function fail(reason) {
    error = reason; socket?.destroy(); socket = null; view = null; starting = null;
    for (const item of pending.values()) { clearTimeout(item.timer); item.reject(new Error(reason)); } pending.clear();
  }
  function command(message) {
    if (!socket || socket.destroyed) return Promise.reject(new Error(error || 'Game authority is unavailable.'));
    const id = ++serial;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('Game authority did not confirm the input.')); }, 5000);
      pending.set(id, { resolve, reject, timer }); socket.write(JSON.stringify({ ...message, id }) + '\n');
    });
  }
  async function start(saved = {}) {
    if (!available || stopped) throw new Error('The shared Godot runtime is unavailable.');
    if (view && socket) return;
    if (starting) return starting;
    starting = (async () => {
      const nonce = crypto.randomBytes(32).toString('hex'); listener = net.createServer();
      await new Promise((resolve, reject) => { listener.once('error', reject); listener.listen(0, '127.0.0.1', resolve); });
      const connected = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Shared Godot authority could not start.')), 10000);
        listener.on('connection', candidate => {
          candidate.setNoDelay(true);
          let buffer = '', authenticated = false;
          candidate.setTimeout(5000, () => { if (!authenticated) candidate.destroy(); });
          candidate.on('data', chunk => {
            buffer += chunk.toString('utf8'); if (Buffer.byteLength(buffer) > 16 * 1024 * 1024) { candidate.destroy(); return; }
            while (buffer.includes('\n')) {
              const end = buffer.indexOf('\n'), line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
              let message; try { message = JSON.parse(line); } catch { candidate.destroy(); return; }
              if (!authenticated) {
                if (message.nonce !== nonce || socket) { candidate.destroy(); return; }
                authenticated = true; candidate.setTimeout(0); socket = candidate; clearTimeout(timer); resolve(); continue;
              }
              if (message.view) view = message.view;
              if (message.checkpoint) checkpoint = message.checkpoint;
              const item = pending.get(message.id);
              if (item) { pending.delete(message.id); clearTimeout(item.timer); item.resolve(message); }
            }
          });
          candidate.on('error', () => {});
          candidate.on('close', () => { if (socket === candidate && !stopped) fail('Shared Godot authority disconnected.'); });
        });
      }); connected.catch(() => {});
      child = spawnAuthority(path.join(gameRoot, 'recovery/runtime/Godot.exe'), ['--headless', '--path', path.join(gameRoot, 'playable'),
        '--script', 'scripts/multiplayer_authority.gd', '--', '--authority-port=' + listener.address().port, '--authority-nonce=' + nonce],
        { cwd: gameRoot, shell: false, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
      let diagnostics = ''; child.stderr?.on('data', chunk => { diagnostics = (diagnostics + chunk).slice(-1000); });
      const launched = child;
      child.once('error', () => fail('Shared Godot authority could not open.'));
      child.once('exit', () => { if (!stopped && child === launched) fail('Shared Godot authority stopped. ' + diagnostics); });
      try { await connected; listener.close(); listener = null; await command({ type: 'initialize', checkpoint: saved }); error = ''; }
      catch (cause) { listener?.close(); listener = null; child?.kill(); fail(cause.message); throw cause; }
    })(); return starting;
  }
  function reset() { fail('Game authority reset to its durable checkpoint.'); child?.kill(); }
  function close() { stopped = true; listener?.close(); socket?.destroy(); child?.kill(); fail('Game authority closed.'); }
  return { available, start, command, reset, close, read: () => ({ view, checkpoint }), get error() { return error; } };
}
module.exports = { createGodotAuthority };

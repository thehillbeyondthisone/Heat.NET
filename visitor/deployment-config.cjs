'use strict';
// Explicit configuration only. Reading/checking a file starts no listener or worker.
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const tls = require('node:tls');
const C = require('./authority-contract.cjs');
const { loadConfig: loadRemoteAuthority } = require('./authority-client.cjs');
function absolute(value, label) {
  C.assert(typeof value === 'string' && path.isAbsolute(value), label + ' must be an absolute path.');
  return path.resolve(value);
}
function read(file) { return JSON.parse(fs.readFileSync(absolute(file, 'Configuration file'), 'utf8')); }
function port(value) { C.assert(C.integer(value, 1024) && value <= 65535 && value !== 10660, 'Choose an approved port from 1024 to 65535 other than existing HEAT service 10660.'); return value; }
function loadHostConfig(file, allowNetworkBind = false) {
  const raw = read(file);
  C.assert(C.exact(raw, ['bind', 'port', 'world_id', 'game_root', 'state_dir', 'toast_spki', 'ca_file', 'cert_file', 'key_file']), 'Invalid gameplay host configuration.');
  const bind = raw.bind || '127.0.0.1';
  C.assert(net.isIP(bind), 'Use an explicit IP listener address.');
  C.assert(['127.0.0.1', '::1'].includes(bind) || allowNetworkBind, 'A network listener requires explicit --allow-network-bind after deployment approval.');
  C.assert(/^[a-z0-9][a-z0-9-]{2,63}$/.test(raw.world_id || '') && C.HEX.test(raw.toast_spki || ''), 'Set the agreed world id and actual Toast certificate SPKI hash.');
  const materials = { ca: fs.readFileSync(absolute(raw.ca_file, 'CA file')), cert: fs.readFileSync(absolute(raw.cert_file, 'Host certificate file')), key: fs.readFileSync(absolute(raw.key_file, 'Host key file')) };
  tls.createSecureContext({ ...materials, minVersion: 'TLSv1.3', maxVersion: 'TLSv1.3' });
  return { bind, port: port(raw.port), worldId: raw.world_id, gameRoot: absolute(raw.game_root, 'Game root'), stateDir: absolute(raw.state_dir, 'Host state directory'), toastSpki: raw.toast_spki, tls: materials };
}
function loadToastConfig(file) {
  const raw = read(file);
  C.assert(C.exact(raw, ['port', 'game_root', 'state_dir', 'authority_config_file']), 'Invalid Toast HEAT configuration.');
  const remoteAuthority = loadRemoteAuthority(absolute(raw.authority_config_file, 'Remote authority configuration'));
  tls.createSecureContext({ ca: remoteAuthority.ca, cert: remoteAuthority.cert, key: remoteAuthority.key, minVersion: 'TLSv1.3', maxVersion: 'TLSv1.3' });
  return { port: port(raw.port), gameRoot: absolute(raw.game_root, 'Game root'), stateDir: absolute(raw.state_dir, 'HEAT state directory'), remoteAuthority };
}
function argumentsFor(argv, allowNetworkFlag = false) {
  const args = { check: false, allowNetworkBind: false }; const seen = new Set();
  for (const arg of argv) {
    const key = arg.startsWith('--config=') ? '--config' : arg;
    C.assert(!seen.has(key), 'Duplicate command argument.'); seen.add(key);
    if (key === '--config') args.file = absolute(arg.slice('--config='.length), 'Configuration file');
    else if (arg === '--check') args.check = true;
    else if (arg === '--allow-network-bind' && allowNetworkFlag) args.allowNetworkBind = true;
    else throw new Error('Use --config=ABSOLUTE_FILE [--check]' + (allowNetworkFlag ? ' [--allow-network-bind after approval].' : '.'));
  }
  C.assert(args.file, 'An explicit --config=ABSOLUTE_FILE is required.');
  C.assert(Number(process.versions.node.split('.')[0]) >= 22, 'Node 22 or newer is required.');
  return args;
}
module.exports = { loadHostConfig, loadToastConfig, argumentsFor };

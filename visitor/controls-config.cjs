'use strict';
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const tls = require('node:tls');
const { X509Certificate } = require('node:crypto');
const C = require('./authority-contract.cjs');
function absolute(value, label) { C.assert(typeof value === 'string' && path.isAbsolute(value), label + ' must be an absolute prepared path.'); return path.resolve(value); }
function read(file) { return JSON.parse(fs.readFileSync(absolute(file, 'Configuration'), 'utf8')); }
function leaf(cert, usage) {
  const value = new X509Certificate(cert), time = Date.now();
  C.assert(!value.ca && Date.parse(value.validFrom) <= time && Date.parse(value.validTo) > time, 'Prepared certificate is not currently valid. Renew the approved setup.');
  C.assert(value.keyUsage?.includes('1.3.6.1.5.5.7.3.' + usage), 'Prepared certificate has the wrong service role.');
  return value.validTo;
}
function loadPlayerConfig(file) {
  const raw = read(file); C.assert(C.exact(raw, ['endpoint', 'world_id', 'server_spki', 'ca_file']), 'Player setup accepts public trust only. No broker certificate/private key is permitted.');
  const ca = fs.readFileSync(absolute(raw.ca_file, 'Public CA certificate'));
  C.assert(!ca.includes('PRIVATE KEY') && ca.includes('BEGIN CERTIFICATE'), 'Player trust file must contain public certificates only.');
  const config = { endpoint: raw.endpoint, world_id: raw.world_id, server_spki: raw.server_spki, ca };
  const link = require('./player-link.cjs').createPlayerLink(config); link.close(); return config;
}
function loadListenerConfig(file, networkApproved) {
  const raw = read(file); C.assert(C.exact(raw, ['bind', 'port', 'world_id', 'cert_file', 'key_file']), 'Invalid player listener setup.');
  C.assert(net.isIP(raw.bind) && C.integer(raw.port, 1024) && raw.port <= 65535 && ![10660, 10662].includes(raw.port), 'Choose the explicit approved player listener address/port.');
  C.assert(['127.0.0.1', '::1'].includes(raw.bind) || networkApproved, 'LAN listener has not been approved/configured.');
  C.assert(/^[a-z0-9][a-z0-9-]{2,63}$/.test(raw.world_id || ''), 'Set the agreed world id.');
  const material = { cert: fs.readFileSync(absolute(raw.cert_file, 'Toast player server certificate')), key: fs.readFileSync(absolute(raw.key_file, 'Toast player server key')) };
  tls.createSecureContext({ ...material, minVersion: 'TLSv1.3', maxVersion: 'TLSv1.3' });
  leaf(material.cert, 1);
  return { bind: raw.bind, port: raw.port, worldId: raw.world_id, tls: material };
}
function loadControlsConfig(file) {
  const raw = read(file);
  C.assert(C.exact(raw, ['version', 'role', 'network_approved', 'game_root', 'player_config_file', 'service_config_file']) && raw.version === 1 && ['player', 'toast', 'authority'].includes(raw.role) && typeof raw.network_approved === 'boolean', 'Invalid prepared desktop-control setup.');
  const result = { role: raw.role, networkApproved: raw.network_approved, gameRoot: absolute(raw.game_root, 'Game root'), playerConfigFile: absolute(raw.player_config_file, 'Player config'), serviceConfigFile: raw.service_config_file };
  if (raw.role !== 'player') result.serviceConfigFile = absolute(raw.service_config_file, 'Service config');
  else C.assert(raw.service_config_file === '', 'A player-only setup has no trusted service credentials.');
  return result;
}
function loadToastService(file, networkApproved) {
  const raw = read(file); C.assert(C.exact(raw, ['port', 'game_root', 'state_dir', 'authority_config_file', 'player_listener_config_file',...(Object.hasOwn(raw,'da_bomb')?['da_bomb']:[])]), 'Invalid Toast service setup.');
  let daBomb;
  if(Object.hasOwn(raw,'da_bomb')){const q=raw.da_bomb;C.assert(C.exact(q,['bind','port'])&&net.isIPv4(q.bind)&&q.bind!=='0.0.0.0'&&C.integer(q.port,1024)&&q.port<=65535,'Use an explicit Da Bomb IPv4 bind and UDP port.');C.assert(q.bind.startsWith('127.')||networkApproved,'Configure LAN approval before hosting Da Bomb on the LAN.');daBomb={bind:q.bind,port:q.port,address:q.bind+':'+q.port};}
  // Reuse the existing strict authority-material loader without generating/writing any file.
  const remoteAuthority = require('./authority-client.cjs').loadConfig(absolute(raw.authority_config_file, 'Authority config'));
  tls.createSecureContext({ ca: remoteAuthority.ca, cert: remoteAuthority.cert, key: remoteAuthority.key, minVersion: 'TLSv1.3', maxVersion: 'TLSv1.3' }); leaf(remoteAuthority.cert, 2);
  C.assert(C.integer(raw.port, 1024) && raw.port <= 65535 && ![10660, 10662, 10663].includes(raw.port), 'Choose an isolated loopback HEAT port.');
  const listener = loadListenerConfig(absolute(raw.player_listener_config_file, 'Player listener config'), networkApproved);
  C.assert(listener.worldId === remoteAuthority.world_id, 'Player and gameplay world ids must match.');
  return { port: raw.port, gameRoot: absolute(raw.game_root, 'Game root'), stateDir: absolute(raw.state_dir, 'HEAT state'), remoteAuthority, listener,...(daBomb?{daBomb}:{}) };
}
module.exports = { loadControlsConfig, loadPlayerConfig, loadListenerConfig, loadToastService, leaf };

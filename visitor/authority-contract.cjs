'use strict';
// This module has no account database or reward policy. It defines the game boundary only.
const crypto = require('node:crypto');
const PROTOCOL = '10six-authority-mtls-v1';
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const assert = (value, message) => { if (!value) throw new Error(message); };
const exact = (value, keys) => plain(value) && keys.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => keys.includes(key));
const integer = (value, min = 0) => Number.isSafeInteger(value) && value >= min;
const PROFILE = /^local-[a-f0-9]{32}$/;
const SESSION = /^session-[a-f0-9]{32}$/;
const HEX = /^[a-f0-9]{64}$/;
function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (plain(value)) return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  return JSON.stringify(value);
}
const digest = value => crypto.createHash('sha256').update(canonical(value)).digest('hex');
function action(input) {
  const fields = { sync: ['type', 'frame', 'active'], claim: ['type', 'camp', 'corporation'], build: ['type', 'camp', 'kind', 'x', 'z', 'facility'],
    store: ['type', 'camp', 'facility'], move: ['type', 'camp', 'x', 'z'], stop: ['type', 'camp'], jump: ['type', 'camp'], enter: ['type', 'camp'], exit: ['type', 'camp'] }[input?.type];
  assert(plain(input) && fields && Object.keys(input).every(key => fields.includes(key)), 'Only game intents are accepted.');
  if (input.type === 'sync') { assert(integer(input.frame) && typeof input.active === 'boolean', 'Invalid frame acknowledgement.'); return; }
  assert(integer(input.camp, 1) && input.camp <= 2500, 'Invalid camp.');
  if (input.type === 'claim') assert(['bruteforce', 'toyco', 'extreme', 'infrastruct'].includes(input.corporation), 'Invalid corporation.');
  if (input.type === 'build') assert(['nc', 'well'].includes(input.kind), 'Unsupported construction intent.');
  if (['build', 'move'].includes(input.type)) assert(['x', 'z'].every(key => typeof input[key] === 'number' && Number.isFinite(input[key]) && Math.abs(input[key]) <= (input.type === 'move' ? 1 : 100)), 'Invalid coordinates.');
  if (['store', 'build'].includes(input.type)) assert(input.facility === undefined || integer(input.facility), 'Invalid facility.');
}
function binding(input) {
  assert(PROFILE.test(input.profile_id || '') && SESSION.test(input.session_id || '') && HEX.test(input.generation || ''), 'Invalid HEAT admission binding.');
}
function spki(cert) { return crypto.createHash('sha256').update(new crypto.X509Certificate(cert).publicKey.export({ type: 'spki', format: 'der' })).digest('hex'); }
module.exports = { PROTOCOL, plain, assert, exact, integer, HEX, PROFILE, SESSION, canonical, digest, action, binding, spki };

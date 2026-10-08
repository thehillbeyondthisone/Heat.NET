'use strict';
const crypto = require('node:crypto');
const path = require('node:path');
const { promisify } = require('node:util');
const M = require('./model.cjs');
const scrypt = promisify(crypto.scrypt);
const COST = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const TTL = 7 * 86400;
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const username = value => typeof value === 'string' ? value.trim().toLowerCase() : '';
function validate(data) {
  M.assert(M.plain(data) && data.version === 1 && Array.isArray(data.accounts) && M.plain(data.sessions), 'Account store needs recovery.');
  const names = new Set(), ids = new Set();
  for (const a of data.accounts) {
    M.assert(M.plain(a) && /^[a-z0-9_]{3,24}$/.test(a.username) && !names.has(a.username) &&
      M.PROFILE_ID.test(a.profile_id) && !ids.has(a.profile_id) && /^[a-f0-9]{32}$/.test(a.salt) &&
      /^[a-f0-9]{128}$/.test(a.password_hash) && a.algorithm === 'scrypt-v1' && typeof a.legacy === 'boolean' && M.number(a.created_unix), 'Invalid account record.');
    names.add(a.username); ids.add(a.profile_id);
  }
  M.assert(data.accounts.filter(a => a.legacy).length <= 1, 'Existing pioneer belongs to more than one account.');
  for (const [key, s] of Object.entries(data.sessions)) M.assert(/^[a-f0-9]{64}$/.test(key) && M.plain(s) &&
    ids.has(s.profile_id) && M.number(s.expires_unix), 'Invalid sign-in session.');
  return data;
}
function createAccounts(stateDir, now) {
  const file = path.join(stateDir, 'accounts.json');
  let data = M.readJSON(file, validate) || { version: 1, accounts: [], sessions: {} };
  let busy = false;
  const limits = new Map();
  function save(next) { M.atomicJSON(file, next, validate); data = next; }
  function token(req) { return /(?:^|;\s*)heat_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1] || ''; }
  function current(req) {
    const session = data.sessions[hash(token(req))];
    return session && session.expires_unix > now() ? data.accounts.find(a => a.profile_id === session.profile_id) : null;
  }
  function publicAccount(a) { return a ? { username: a.username, profile_id: a.profile_id } : null; }
  function setCookie(res, value, age) {
    res.setHeader('Set-Cookie', `heat_session=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}`);
  }
  function issue(res, account, req) {
    const next = structuredClone(data), raw = crypto.randomBytes(32).toString('hex');
    delete next.sessions[hash(token(req))];
    for (const [key, s] of Object.entries(next.sessions)) if (s.expires_unix <= now()) delete next.sessions[key];
    M.assert(Object.keys(next.sessions).length < 4096, 'Too many sign-in sessions. Sign out an existing session first.');
    next.sessions[hash(raw)] = { profile_id: account.profile_id, expires_unix: now() + TTL };
    save(next); setCookie(res, raw, TTL);
    return publicAccount(account);
  }
  function throttle(req, name) {
    const keys = ['ip:' + req.socket.remoteAddress, 'name:' + username(name)];
    for (const [key, value] of limits) if (value.until <= now()) limits.delete(key);
    M.assert(limits.size < 10000, 'Please wait before trying again.');
    for (const key of keys) {
      const limit = limits.get(key) || { count: 0, until: now() + 300 };
      M.assert(limit.count < 10, 'Too many account attempts. Try again in five minutes.');
      limit.count++; limits.set(key, limit);
    }
  }
  async function register(req, res, input, legacyPlayer, initialize, canAdopt) {
    throttle(req, input.username);
    M.assert(!busy, 'Another account request is finishing. Please try again.');
    const name = username(input.username);
    M.assert(/^[a-z0-9_]{3,24}$/.test(name), 'Use 3–24 letters, numbers or underscores for your username.');
    M.assert(typeof input.password === 'string' && input.password.length >= 12 && Buffer.byteLength(input.password) <= 256,
      'Use a password of at least 12 characters (up to 256 bytes).');
    M.assert(M.text(input.display_name, 32) && input.display_name.trim(), 'Use a display name between 1 and 32 characters.');
    M.assert(!data.accounts.some(a => a.username === name), 'That username is already registered.');
    M.assert(data.accounts.length < 256, 'This local server has reached its account limit.');
    const legacy = input.adopt_local === true;
    M.assert(!legacy || (canAdopt && data.accounts.length === 0), 'Only the first account created on this PC can keep the existing pioneer.');
    busy = true;
    try {
      const salt = crypto.randomBytes(16).toString('hex');
      const password_hash = (await scrypt(input.password, salt, 64, COST)).toString('hex');
      const account = { username: name, profile_id: legacy ? legacyPlayer.id : 'local-' + crypto.randomBytes(16).toString('hex'),
        salt, password_hash, algorithm: 'scrypt-v1', legacy, created_unix: now() };
      // Preserve the old alias on adoption. The signed-in name editor can change it later.
      initialize(account, legacy ? legacyPlayer.display_name : input.display_name.trim());
      const next = structuredClone(data); next.accounts.push(account); save(next);
      return issue(res, account, req);
    } finally { busy = false; }
  }
  async function login(req, res, input) {
    throttle(req, input.username);
    M.assert(typeof input.password === 'string' && Buffer.byteLength(input.password) <= 256, 'Username or password is incorrect.');
    const account = data.accounts.find(a => a.username === username(input.username));
    const candidate = await scrypt(input.password, account?.salt || '0'.repeat(32), 64, COST);
    M.assert(account && crypto.timingSafeEqual(candidate, Buffer.from(account.password_hash, 'hex')), 'Username or password is incorrect.');
    return issue(res, account, req);
  }
  function logout(req, res) {
    const next = structuredClone(data); delete next.sessions[hash(token(req))]; save(next); setCookie(res, '', 0);
  }
  return { current, publicAccount, register, login, logout,
    get enabled() { return data.accounts.length > 0; }, get accounts() { return data.accounts; } };
}
module.exports = { createAccounts, validate };

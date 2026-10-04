'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const M = require('./model.cjs');
const D = require('./degrees.cjs');
const T = require('./trophies.cjs');

const MIME = { '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.gif': 'image/gif', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.ico': 'image/x-icon', '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8', '.mhtml': 'message/rfc822', '.swf': 'application/x-shockwave-flash' };

function validateLedger(data) {
  M.assert(M.plain(data) && data.version === 1 && M.plain(data.profiles) && M.plain(data.sessions), 'Degree ledger needs recovery.');
  for (const [id, p] of Object.entries(data.profiles)) {
    M.assert(M.PROFILE_ID.test(id) && M.plain(p) && M.integer(p.balance) && M.number(p.gameplay_seconds) &&
      Array.isArray(p.launch_days) && Array.isArray(p.transactions), 'Invalid Degree profile.');
    M.assert(new Set(p.launch_days).size === p.launch_days.length && p.launch_days.every(d => /^\d{4}-\d{2}-\d{2}$/.test(d)), 'Invalid attendance record.');
    const ids = new Set(); let sum = 0;
    for (const t of p.transactions) {
      M.assert(M.plain(t) && M.text(t.id) && !ids.has(t.id) && M.number(t.unix) && M.integer(t.amount, 1) && M.text(t.reason), 'Invalid Degree transaction.');
      ids.add(t.id); sum += t.amount;
    }
    M.assert(sum === p.balance, 'Degree balance does not match its ledger.');
  }
  for (const [id, s] of Object.entries(data.sessions)) M.assert(M.SESSION_ID.test(id) && M.plain(s) && M.PROFILE_ID.test(s.profile_id) &&
    M.number(s.started_unix) && M.number(s.last_unix) && M.number(s.active_seconds) && typeof s.confirmed === 'boolean' &&
    typeof s.closed === 'boolean' && Array.isArray(s.connected_days), 'Invalid launch record.');
  return data;
}
function validateTrophies(data) {
  M.assert(M.plain(data) && data.version === 1 && M.plain(data.profiles), 'Visitor trophy ledger needs recovery.');
  for (const [id, grants] of Object.entries(data.profiles)) {
    M.assert(M.PROFILE_ID.test(id) && Array.isArray(grants), 'Invalid trophy profile.');
    const ids = new Set();
    for (const g of grants) {
      M.assert(M.plain(g) && T.VISITOR.some(t => t.id === g.id) && !ids.has(g.id) && M.number(g.unix) &&
        /^report-[a-f0-9]{64}$/.test(g.report_id || '') && g.classification === 'EXPANSION' && M.text(g.reason, 160), 'Invalid Visitor award.');
      ids.add(g.id);
    }
  }
  return data;
}
function createVisitorServer(options = {}) {
  const root = path.resolve(options.root || path.join(__dirname, '..'));
  const stateDir = path.resolve(options.stateDir || process.env.HEAT_STATE_DIR || path.join(root, '.local', 'visitor'));
  const reportDir = path.resolve(options.reportDir || process.env.HEAT_REPORT_DIR || path.join(stateDir, 'reports'));
  const gameRoot = options.gameRoot || process.env.HEAT_GAME_ROOT;
  const identityFile = path.join(stateDir, 'identity.json'), ledgerFile = path.join(stateDir, 'degrees.json');
  const trophyFile = path.join(stateDir, 'trophies.json');
  const importDir = path.join(stateDir, 'imports');
  const now = options.now || (() => Date.now() / 1000), spawnGame = options.spawnGame || spawn;
  let player, ledger, trophyLedger, stateError = '', child = null, childSession = '', launchError = '';
  try {
    player = M.identity(identityFile); ledger = M.readJSON(ledgerFile, validateLedger) || D.newLedger();
    trophyLedger = M.readJSON(trophyFile, validateTrophies) || T.newLedger();
  }
  catch { stateError = 'Your local profile, Degree ledger or trophy cabinet needs recovery. Existing files have been retained.'; }

  function saveLedger(next) { M.atomicJSON(ledgerFile, next, validateLedger); ledger = next; }
  function reports() {
    const all = new Map(), errors = [];
    for (const [directory, isImport] of [[reportDir, false], [importDir, true]]) {
      if (!fs.existsSync(directory)) continue;
      for (const file of fs.readdirSync(directory).filter(f => /^local-[a-f0-9]{32}\.json$/.test(f)).sort()) {
        try {
          const absolute = path.join(directory, file);
          M.assert(!fs.lstatSync(absolute).isSymbolicLink() && fs.statSync(absolute).size <= M.MAX_REPORT, 'Invalid report file.');
          const report = M.readJSON(absolute, M.validateReport);
          M.assert(report.profile.id + '.json' === file, 'Report identity does not match its filename.');
          M.assert(report.generated_unix <= now() + 5, 'Report comes from a future clock.');
          // Only this machine's opted-in live report can provide ledger evidence.
          if (!isImport && player && report.profile.id === player.id && !stateError) {
            try {
              const next = structuredClone(ledger);
              if (D.observe(next, report, now()) && M.canonical(next) !== M.canonical(ledger)) saveLedger(next);
              const trophyNext = structuredClone(trophyLedger);
              if (T.observe(trophyNext, report, now())) { M.atomicJSON(trophyFile, trophyNext, validateTrophies); trophyLedger = trophyNext; }
            } catch { errors.push('Your camp report is valid, but its local award state could not be saved. Previous awards were retained.'); }
          }
          const old = all.get(report.profile.id);
          if (!old || (!isImport && old.imported) || (old.imported === isImport && report.generated_unix > old.generated_unix))
            all.set(report.profile.id, { ...report, imported: isImport });
        } catch {
          errors.push('A Visitor report could not be verified. Its file was retained.');
        }
      }
    }
    return { all: Array.from(all.values()), errors };
  }
  function catalogue() {
    const data = JSON.parse(fs.readFileSync(path.join(root, 'site/data/trophies.json'), 'utf8'));
    const base = '/site/images/trophies/';
    const retired = data.retired.map(t => {
      const artFile = path.join(root, 'site/images/trophies', path.basename(t.image));
      const artAvailable = fs.existsSync(artFile) && /^GIF8[79]a$/.test(fs.readFileSync(artFile).subarray(0, 6).toString('ascii'));
      const item = { ...t, verified: true, verified_fields: ['name', 'description', ...(artAvailable ? ['image'] : [])], grantable: false,
        image_url: artAvailable ? base + t.image : '', art_available: artAvailable,
        provenance: 'Preserved retired HEAT trophy page', status: 'historical' };
      if (item.id === 'premium-potm') { delete item.retiredDate; delete item.retiredYear; }
      return item;
    });
    const holiday = { id: 'holiday', name: 'Holiday HEAT Trophy', image: '', image_url: '',
      description: 'Awarded for logging in during a historical holiday or HEAT anniversary; retired after each event.',
      category: 'event', status: 'historical', verified: true, grantable: false, provenance: 'Preserved retired HEAT trophy page' };
    // 21102.gif is an advertisement, not trophy art. Leave the preserved source catalog untouched.
    const unverified = data.active.filter(t => t.id !== 'premium-member').map(t => ({ ...t, verified: false,
      grantable: false, status: 'unverified', image_url: base + t.image, provenance: 'Uncorroborated restoration catalog metadata' }));
    return { retired: [...retired, holiday], active: unverified, visitor: T.VISITOR,
      historical: [...retired, holiday], unverified, proposals: [
        { id: 'visitor-community-tester', name: 'Revived 10SIX Community Tester', classification: 'EXPANSION', status: 'proposed', description: 'Community recognition for testing and helping other pioneers; selection criteria await review.' },
      ] };
  }
  function gameAvailable() {
    return Boolean(gameRoot && fs.existsSync(path.join(gameRoot, 'recovery/runtime/Godot.exe')) && fs.existsSync(path.join(gameRoot, 'playable/project.godot')));
  }
  function snapshot() {
    const result = reports(), time = now();
    const profiles = result.all.map(report => {
      if (player && report.profile.id === player.id) {
        report.profile = { ...report.profile, display_name: player.display_name };
        report.camps = report.camps.map(c => ({ ...c, owner_display_name: c.owner_id === player.id ? player.display_name : c.owner_display_name }));
      }
      return { ...report, degrees: player && report.profile.id === player.id && ledger ? D.view(ledger, player.id, time) :
        { balance: null, transactions: [], ledger: [], status: 'comparison_only', policy: 'archived_heat_rules', timezone: D.POLICY.timezone },
      trophies: player && report.profile.id === player.id && trophyLedger ? T.view(trophyLedger, player.id) :
        { granted: [], proposals: catalogue().proposals, status: 'comparison_only' },
      freshness: { age_seconds: Math.max(0, time - report.generated_unix), stale: time - report.generated_unix > 15 } };
    }).sort((a, b) => a.profile.display_name.localeCompare(b.profile.display_name) || a.profile.id.localeCompare(b.profile.id));
    return { version: 1, selected_profile_id: player?.id || '', identity: player || null, profiles,
      degrees: player && ledger ? D.view(ledger, player.id, time) : null, catalog: catalogue(), rules: D.POLICY,
      trophies: player && trophyLedger ? T.view(trophyLedger, player.id) : null,
      launch: { available: !stateError && gameAvailable(), running: Boolean(child), profile_id: player?.id || '', error: launchError },
      errors: [...(stateError ? [stateError] : []), ...(launchError ? [launchError] : []), ...result.errors], generated_unix: time };
  }
  function json(res, status, data) { res.writeHead(status, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); }
  async function body(req) {
    M.assert(/^application\/json(?:;|$)/i.test(req.headers['content-type'] || ''), 'Use a JSON request.');
    let size = 0, chunks = [];
    for await (const chunk of req) { size += chunk.length; M.assert(size <= M.MAX_REPORT, 'Report exceeds the 2 MB limit.'); chunks.push(chunk); }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }
  async function mutate(req, res, pathname) {
    M.assert(!stateError, stateError);
    const port = server.address().port, expected = `http://127.0.0.1:${port}`;
    M.assert(req.headers.origin === expected || req.headers.origin === `http://localhost:${port}`, 'Open this action from the local HEAT.NET preview.');
    const data = await body(req); M.assert(M.plain(data), 'Invalid request.');
    if (pathname === '/api/visitor/profile') {
      M.assert(M.text(data.display_name, 32) && data.display_name.trim(), 'Use a player name between 1 and 32 characters.');
      const next = { ...player, display_name: data.display_name.trim() };
      M.writeIdentity(identityFile, next); player = next;
      return json(res, 200, { ok: true, identity: player });
    }
    if (pathname === '/api/visitor/import') {
      const report = M.validateReport(data.report);
      M.assert(report.profile.id !== player.id, 'Your own camp updates directly from 10Six. Import another pioneer for comparison.');
      M.assert(report.generated_unix <= now() + 5, 'That report has a future timestamp.');
      const file = path.join(importDir, report.profile.id + '.json'), old = M.readJSON(file, M.validateReport);
      M.assert(!old || report.generated_unix >= old.generated_unix, 'A newer report from this pioneer is already present.');
      M.atomicJSON(file, report, M.validateReport);
      return json(res, 200, { ok: true, profile_id: report.profile.id, message: 'Pioneer report imported for comparison.' });
    }
    if (pathname === '/api/visitor/launch') {
      M.assert(!data.profile_id || data.profile_id === player.id, 'Only your local Pioneer can launch here.');
      M.assert(gameAvailable(), 'The local 10Six runtime is not configured. Use Connect HEAT.NET.cmd.');
      if (child) return json(res, 200, { ok: true, running: true, session_id: childSession, message: '10Six is already running.' });
      const time = now(), id = 'session-' + crypto.randomBytes(16).toString('hex'), next = structuredClone(ledger);
      D.beginSession(next, id, player.id, time); saveLedger(next); launchError = '';
      const args = ['--path', path.join(gameRoot, 'playable'), '--log-file', path.join(stateDir, 'game.log'), '--',
        '--heat-identity=' + identityFile, '--heat-report=' + path.join(reportDir, player.id + '.json'),
        '--heat-session=' + id, '--heat-started=' + time];
      try {
        child = spawnGame(path.join(gameRoot, 'recovery/runtime/Godot.exe'), args,
          { cwd: gameRoot, shell: false, windowsHide: false, stdio: 'ignore' }); childSession = id;
        const close = () => {
          if (childSession !== id) return;
          try { reports(); const closed = structuredClone(ledger); closed.sessions[id].closed = true; saveLedger(closed); } catch { launchError = 'Launch ended; Degree ledger could not be updated.'; }
          child = null; childSession = '';
        };
        child.once('error', () => { launchError = '10Six could not open. No launch-day Degrees were awarded.'; close(); });
        child.once('exit', close);
      } catch { child = null; next.sessions[id].closed = true; saveLedger(next); throw new Error('10Six could not open.'); }
      return json(res, 200, { ok: true, running: true, session_id: id, message: '10Six is opening. Your camp appears after you enter Visitor.' });
    }
    return json(res, 404, { error: 'Unknown Visitor action.' });
  }
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    try {
      const host = req.headers.host || '';
      if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host)) return json(res, 403, { error: 'Use the loopback HEAT.NET preview address.' });
      const url = new URL(req.url, 'http://' + host), pathname = decodeURIComponent(url.pathname);
      if (pathname.startsWith('/api/visitor')) {
        if (req.method === 'GET' && pathname === '/api/visitor') return json(res, 200, snapshot());
        if (req.method === 'GET' && pathname === '/api/visitor/health') return json(res, 200, { service: 'heat-visitor-bridge', version: 1 });
        if (req.method === 'GET' && pathname === '/api/visitor/report') {
          const found = reports().all.find(r => r.profile.id === url.searchParams.get('player'));
          if (!found) return json(res, 404, { error: 'Pioneer report not found.' });
          res.setHeader('Content-Disposition', 'attachment; filename="' + found.profile.id + '.json"');
          delete found.imported; return json(res, 200, found);
        }
        if (req.method === 'POST') return await mutate(req, res, pathname);
        return json(res, 405, { error: 'This Visitor action does not support that method.' });
      }
      if (!['GET', 'HEAD'].includes(req.method)) return json(res, 405, { error: 'Read-only page.' });
      const relative = pathname === '/' ? 'site/pages/10six.html' : pathname.replace(/^\/+/, '');
      M.assert(!relative.includes('\\') && !relative.includes('\0') && !relative.split('/').some(p => p.startsWith('.')), 'Page not available.');
      M.assert(/^(site\/|original_archive\/|docs\/|index\.html$)/.test(relative), 'Page not available.');
      const target = path.resolve(root, relative), prefix = root + path.sep;
      M.assert(target.startsWith(prefix), 'Page not available.');
      if (!fs.existsSync(target) || !fs.statSync(target).isFile()) return json(res, 404, { error: 'HEAT.NET page not found.' });
      M.assert(fs.realpathSync(target).startsWith(fs.realpathSync(root) + path.sep), 'Page not available.');
      const content = fs.readFileSync(target);
      res.writeHead(200, { 'Content-Type': MIME[path.extname(target).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store', 'Content-Length': content.length });
      res.end(req.method === 'HEAD' ? undefined : content);
    } catch (error) {
      if (!res.headersSent) json(res, 400, { error: error instanceof SyntaxError ? 'That JSON report could not be read.' : error.code ? 'The local action could not be saved. Existing files were retained.' : error.message });
      else res.end();
    }
  });
  return { server, snapshot, get identity() { return player; }, ledgerFile, reportDir, stateDir };
}
module.exports = { createVisitorServer, validateLedger, validateTrophies };

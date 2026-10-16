'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const M = require('./model.cjs');
const D = require('./degrees.cjs');
const T = require('./trophies.cjs');
const A = require('./accounts.cjs');
const H = require('./messenger.cjs');
const G = require('./multiplayer.cjs');
const R = require('./client-rooms.cjs');
const Q = require('./da-bomb.cjs');

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
function validateRunning(data) {
  M.assert(M.plain(data) && data.version === 1 && M.plain(data.games), 'Game launch registry needs recovery.');
  for (const [id, game] of Object.entries(data.games)) M.assert(M.PROFILE_ID.test(id) && M.plain(game) &&
    M.integer(game.pid, 1) && M.SESSION_ID.test(game.id), 'Invalid running game.');
  return data;
}
function createVisitorServer(options = {}) {
  const root = path.resolve(options.root || path.join(__dirname, '..'));
  const stateDir = path.resolve(options.stateDir || process.env.HEAT_STATE_DIR || path.join(root, '.local', 'visitor'));
  const reportDir = path.resolve(options.reportDir || process.env.HEAT_REPORT_DIR || path.join(stateDir, 'reports'));
  const gameRoot = options.gameRoot || process.env.HEAT_GAME_ROOT;
  const identityFile = path.join(stateDir, 'identity.json'), ledgerFile = path.join(stateDir, 'degrees.json');
  const trophyFile = path.join(stateDir, 'trophies.json');
  const runningFile = path.join(stateDir, 'running-games.json');
  const importDir = path.join(stateDir, 'imports');
  const now = options.now || (() => Date.now() / 1000), spawnGame = options.spawnGame || spawn;
  let player, ledger, trophyLedger, accounts, runningGames, stateError = '';
  const children = new Map(), sharedChildren = new Map(), launchErrors = new Map();
  const allowedHosts = new Set(['127.0.0.1', 'localhost', ...(options.allowedHosts || (process.env.HEAT_ALLOWED_HOSTS || '').split(',').filter(Boolean))]);
  try {
    player = M.identity(identityFile); ledger = M.readJSON(ledgerFile, validateLedger) || D.newLedger();
    trophyLedger = M.readJSON(trophyFile, validateTrophies) || T.newLedger();
    accounts = A.createAccounts(stateDir, now);
    runningGames = M.readJSON(runningFile, validateRunning) || { version: 1, games: {} };
  }
  catch { stateError = 'Your local profile, accounts, Degree ledger or trophy cabinet needs recovery. Existing files have been retained.'; }

  const loopback = req => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
  function playerFiles(account) {
    const directory = account && !account.legacy ? path.join(stateDir, 'players', account.profile_id) : stateDir;
    return { identity: path.join(directory, 'identity.json'),
      save: account && !account.legacy ? path.join(directory, 'first-plot.json') : gameRoot && path.join(gameRoot, 'saves/first-plot.json'),
      log: path.join(directory, 'game.log') };
  }
  function context(req) {
    const account = req && accounts?.current(req);
    const localGuest = !accounts?.enabled && (!req || loopback(req));
    const identity = account ? M.identity(playerFiles(account).identity) : localGuest ? player : null;
    return { account, identity };
  }
  function initializeAccount(account, name) {
    if (!account.legacy) M.writeIdentity(playerFiles(account).identity, { id: account.profile_id, display_name: name });
  }
  const messenger = !stateError && H.createMessenger(stateDir, now,
    () => accounts.accounts.map(a => ({ ...accounts.publicAccount(a), display_name: M.identity(playerFiles(a).identity).display_name })),
    key => accounts.activeSession(key), id => Boolean(runningGame(id)) || Boolean(multiplayer?.status(id).joined) || Boolean(daBomb?.running(id)));
  function settleMessenger() {
    if (!messenger || messenger.error) return;
    const next = structuredClone(ledger); if (messenger.reconcile(next)) saveLedger(next);
  }
  function runningGame(id) {
    if (children.has(id)) return children.get(id);
    const game = runningGames?.games[id];
    if (!game) return null;
    // A live recorded PID blocks another launch after a service restart. Never kill
    // a recorded process: PID reuse may belong to something else.
    try { process.kill(game.pid, 0); return game; }
    catch (error) { if (error.code !== 'ESRCH') return game; }
    const next = structuredClone(runningGames); delete next.games[id];
    M.atomicJSON(runningFile, next, validateRunning); runningGames = next; return null;
  }
  function activeGameCount() {
    return new Set([...children.keys(), ...sharedChildren.keys(), ...(multiplayer?.connectedProfiles()||[]), ...(daBomb?.profiles()||[]), ...Object.keys(runningGames?.games || {}).filter(id => runningGame(id))]).size;
  }

  function saveLedger(next) { M.atomicJSON(ledgerFile, next, validateLedger); ledger = next; }
  const multiplayer = stateError ? null : G.createMultiplayer({ stateDir, gameRoot, now, remoteAuthority: options.remoteAuthority, authorityFactory: options.authorityFactory,
    accountActive: key => accounts.activeSession(key), localRunning: id => Boolean(runningGame(id) || daBomb?.busy(id)),
    award(evidence) {
      const next = structuredClone(ledger);
      if (!next.sessions[evidence.session_id]) {
        D.beginSession(next, evidence.session_id, evidence.profile_id, evidence.started_unix);
        next.sessions[evidence.session_id].authority = G.KIND;
      }
      if (D.observeServer(next, evidence, now()) && M.canonical(next) !== M.canonical(ledger)) saveLedger(next);
      const facts = { profile: { id: evidence.profile_id },
        camps: evidence.camps.map(c => ({ number: c.number, owner_id: c.owner_id, metrics: { nerve_center_online: c.nerve_center_online } })),
        registry: evidence.camps.map(c => ({ number: c.number, owner_id: c.owner_id })) };
      facts.report_id = 'report-' + crypto.createHash('sha256').update(M.canonical(evidence)).digest('hex');
      const awards = structuredClone(trophyLedger);
      if (T.observe(awards, facts, now())) { M.atomicJSON(trophyFile, awards, validateTrophies); trophyLedger = awards; }
    }
  });
  const rooms = options.clientEnabled === true && !stateError ? R.createClientRooms({ stateDir, now, active: key => accounts.activeSession(key),
    inGame: id => Boolean(sharedChildren.has(id) || runningGame(id) || multiplayer?.connected(id) || pendingRoom(id) || daBomb?.busy(id)), playing: id => Boolean(multiplayer?.status(id).joined || runningGame(id)),
    name: id => { const a=accounts.accounts.find(a=>a.profile_id===id); return a ? M.identity(playerFiles(a).identity).display_name : 'HEAT player'; },
    worldId: multiplayer?.status().world_id || 'visitor-loopback-v1' }):null;
  const launching = new Map(); let worldCheck = { ready:null, checked_unix:0, message:'Availability is checked when you Play.' };
  const daBomb=rooms?Q.createDaBomb({gameRoot,stateDir,now,spawnGame,config:options.daBomb,active:key=>accounts.activeSession(key),
    name:id=>{const a=accounts.accounts.find(a=>a.profile_id===id);return a?M.identity(playerFiles(a).identity).display_name:'HEAT player';},
    otherGame:id=>Boolean(sharedChildren.has(id)||runningGame(id)||multiplayer?.connected(id)||pendingRoom(id))}):null;
  function clientSnapshot(req) {
    M.assert(options.clientEnabled === true,'Open the prepared desktop HEAT client; this portal has no client owner.');
    const value=snapshot(req),ctx=context(req),id=ctx.account?.profile_id,key=id?accounts.sessionKey(req):'';
    return {...value,client:{version:1,scope:'Toast desktop HEAT accounts',coordination:'authenticated-gateway-v1',world:worldCheck,games:[
      {id:'10six',title:'10Six',subtitle:'Planet Visitor',installed:gameAvailable(),supported:true,running:Boolean(id&&(sharedChildren.has(id)||runningGame(id)||multiplayer?.connected(id))),local_plot:Boolean(id&&runningGame(id)),joined:Boolean(id&&multiplayer?.status(id).joined),artwork:'/site/images/games/10six_shoot_45.jpg'},
      ...(daBomb?[daBomb.game(id)]:[]),
      {id:'quake2',title:'Quake II',supported:false,installed:false,reason:'Client integration and multiplayer verification are still pending.'},
      {id:'scud',title:'Scud',supported:false,installed:false,reason:'Client integration and multiplayer verification are still pending.'}]},
      room:rooms?.view(id,key)||{error:stateError,members:[],messages:[],joined:false},rooms:daBomb?{'da-bomb':daBomb.view(id,key)}:{}};
  }
  async function checkClientWorld(requireReady=true){const ready=Boolean(multiplayer&&await multiplayer.ready());worldCheck={ready,checked_unix:now(),message:ready?'The shared Visitor world is reachable.':'The shared world is unavailable. Its operator must start the server; then retry Play.'};if(requireReady)M.assert(ready,worldCheck.message);return{ok:true,world:worldCheck};}
  async function launchClient(req,ctx,generation){
    const id=ctx.account.profile_id,key=accounts.sessionKey(req);if(sharedChildren.has(id))return{ok:true,running:true,message:'10Six is already open.'};if(launching.has(id))return launching.get(id);
    const work=(async()=>{M.assert(loopback(req)&&gameAvailable(),'The local 10Six client is unavailable.');M.assert(!runningGame(id)&&!daBomb?.busy(id),'Save and close your open game before joining Visitor.');
      rooms.permit(id,key,generation);await checkClientWorld();rooms.permit(id,key,generation);const admission=multiplayer.issue(id,ctx.identity.display_name,key);
      const child=spawnGame(path.join(gameRoot,'recovery/runtime/Godot.exe'),['--path',path.join(gameRoot,'playable'),'--script','scripts/multiplayer_client.gd','--','--shared-url=http://'+req.headers.host,'--shared-ticket='+admission.ticket],{cwd:gameRoot,shell:false,windowsHide:false,stdio:'ignore'});
      sharedChildren.set(id,child);rooms.launched(id,key,generation);const clear=()=>{if(sharedChildren.get(id)===child){sharedChildren.delete(id);multiplayer.release(id,key);rooms.returned(id,key);}};
      child.once('exit',clear);child.once('error',()=>{launchErrors.set(id,'10Six could not open. Check the game files and retry Play.');clear();});launchErrors.delete(id);
      return{ok:true,running:true,message:'10Six is opening. Participation is confirmed by the game server.'};
    })();launching.set(id,work);try{return await work;}finally{launching.delete(id);}
  }
  const roomAdmissions=new Map(),roomAdmissionWork=new Map();
  async function issueRoom(req,ctx,generation){
    const id=ctx.account.profile_id,key=accounts.sessionKey(req);rooms.permit(id,key,generation);pendingRoom(id);
    const old=roomAdmissions.get(id);if(old&&old.key===key&&old.generation===generation)return old.admission;
    const existing=roomAdmissionWork.get(id);if(existing){M.assert(existing.key===key&&existing.generation===generation,'An earlier room launch is finishing.');return existing.work;}
    const work=(async()=>{M.assert(!multiplayer.connected(id)&&!sharedChildren.has(id)&&!runningGame(id),'Close the existing game before another room launch.');await checkClientWorld();rooms.permit(id,key,generation);const admission=multiplayer.issue(id,ctx.identity.display_name,key);roomAdmissions.set(id,{key,generation,admission});rooms.launched(id,key,generation);return admission;})();
    roomAdmissionWork.set(id,{key,generation,work});try{return await work;}finally{roomAdmissionWork.delete(id);}
  }
  function pendingRoom(id){for(const[p,a]of roomAdmissions)if(a.admission.expires_unix<=now()||!accounts.activeSession(a.key))roomAdmissions.delete(p);return roomAdmissions.has(id);}
  async function roomAction(req,action,data,remote=false){
    const ctx=context(req);M.assert(rooms&&ctx.account&&(remote||loopback(req)),'Use the signed-in HEAT client.');
    const id=ctx.account.profile_id,key=accounts.sessionKey(req),exact=keys=>M.plain(data)&&Object.keys(data).sort().join(',')===keys.sort().join(',');
    if(action==='join'){M.assert(exact([]),'Join uses your signed-in identity.');rooms.join(id,key);}
    else if(action==='heartbeat'){M.assert(exact([]),'Heartbeat has no player fields.');rooms.heartbeat(id,key);}
    else if(action==='leave'){M.assert(exact([]),'Leave uses your signed-in identity.');rooms.leave(id,key);}
    else if(action==='ready'){M.assert(exact(['ready']),'Use the ready flag.');rooms.ready(id,key,data.ready);}
    else if(action==='chat')return rooms.send(id,key,data);
    else if(action==='check'){M.assert(exact([]),'Check has no player fields.');return checkClientWorld();}
    else if(action==='start'){M.assert(exact([]),'Start uses the existing room.');M.assert(remote||gameAvailable(),'The local 10Six client is unavailable.');await checkClientWorld();return{ok:true,generation:rooms.begin(id,key)};}
    else if(action==='play'){M.assert(!remote&&exact(['generation']),'Use the local native launch.');return launchClient(req,ctx,data.generation);}
    else if(action==='admission'){
      M.assert(remote&&exact(['generation']),'Use the current group generation.');return issueRoom(req,ctx,data.generation);
    }
    else if(action==='return'){
      M.assert(remote&&exact([])&&rooms.view(id,key).joined,'Return uses your current room membership.');
      M.assert(!multiplayer.connected(id)&&!sharedChildren.has(id)&&!runningGame(id),'Disconnect the native game before returning.');
      if(roomAdmissions.get(id)?.key===key)roomAdmissions.delete(id);rooms.returned(id,key);
    }else throw new Error('Unknown HEAT client action.');
    return{ok:true,room:rooms.view(id,key)};
  }
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
          if (!isImport && !stateError && (report.profile.id === player?.id || accounts?.accounts.some(a => a.profile_id === report.profile.id))) {
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
  function snapshot(req) {
    let messengerError = messenger?.error || '';
    try { settleMessenger(); } catch { messengerError = 'A Messenger prize could not be saved. Its winner is retained for retry.'; }
    const ctx = context(req), own = ctx.identity, running = own && runningGame(own.id);
    const launchError = own && launchErrors.get(own.id) || '';
    const result = reports(), time = now();
    const profiles = result.all.map(report => {
      if (own && report.profile.id === own.id) {
        report.profile = { ...report.profile, display_name: own.display_name };
        report.camps = report.camps.map(c => ({ ...c, owner_display_name: c.owner_id === own.id ? own.display_name : c.owner_display_name }));
      }
      return { ...report, degrees: own && report.profile.id === own.id && ledger ? D.view(ledger, own.id, time) :
        { balance: null, transactions: [], ledger: [], status: 'comparison_only', policy: 'archived_heat_rules', timezone: D.POLICY.timezone },
      trophies: own && report.profile.id === own.id && trophyLedger ? T.view(trophyLedger, own.id) :
        { granted: [], proposals: catalogue().proposals, status: 'comparison_only' },
      freshness: { age_seconds: Math.max(0, time - report.generated_unix), stale: time - report.generated_unix > 15 } };
    }).sort((a, b) => a.profile.display_name.localeCompare(b.profile.display_name) || a.profile.id.localeCompare(b.profile.id));
    return { version: 1, selected_profile_id: own?.id || '', identity: own || null, profiles: own ? profiles : [],
      auth: { enabled: Boolean(accounts?.enabled), account: accounts?.publicAccount(ctx.account) || null,
        can_adopt: !accounts?.enabled && (!req || loopback(req)) && activeGameCount() === 0, host_pc: !req || loopback(req) },
      multiplayer: multiplayer ? multiplayer.status(own?.id) : { available: false },
      degrees: own && ledger ? D.view(ledger, own.id, time) : null, catalog: catalogue(), rules: D.POLICY,
      trophies: own && trophyLedger ? T.view(trophyLedger, own.id) : null,
      launch: { available: !stateError && gameAvailable() && Boolean(own) && (!req || loopback(req)), running: Boolean(running), any_running: activeGameCount() > 0, profile_id: own?.id || '', error: launchError },
      errors: [...(stateError ? [stateError] : []), ...(messengerError ? [messengerError] : []), ...(launchError ? [launchError] : []), ...result.errors], generated_unix: time };
  }
  function json(res, status, data) { res.writeHead(status, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); }
  async function body(req, limit = M.MAX_REPORT) {
    M.assert(/^application\/json(?:;|$)/i.test(req.headers['content-type'] || ''), 'Use a JSON request.');
    let size = 0, chunks = [];
    for await (const chunk of req) { size += chunk.length; M.assert(size <= limit, 'Request exceeds its size limit.'); chunks.push(chunk); }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }
  async function mutate(req, res, pathname) {
    M.assert(!stateError, stateError);
    M.assert(req.headers.origin === 'http://' + req.headers.host, 'Open this action from the same HEAT.NET address.');
    const data = await body(req, /\/auth\/|\/messenger/.test(pathname) ? 16384 : M.MAX_REPORT); M.assert(M.plain(data), 'Invalid request.');
    if (pathname === '/api/visitor/auth/register') {
      const account = await accounts.register(req, res, data, player, initializeAccount, loopback(req) && activeGameCount() === 0);
      return json(res, 200, { ok: true, account });
    }
    if (pathname === '/api/visitor/auth/login') return json(res, 200, { ok: true, account: await accounts.login(req, res, data) });
    if (pathname === '/api/visitor/auth/logout') { const key = accounts.sessionKey(req);M.assert(!daBomb?.running(context(req).account?.profile_id),'Close Da Bomb before signing out.'); accounts.logout(req, res); messenger?.forget(key); rooms?.forget(key);daBomb?.forget(key); return json(res, 200, { ok: true }); }
    const ctx = context(req), own = ctx.identity;
    if (!own) return json(res, 401, { error: 'Sign in to your HEAT account first.' });
    if (pathname === '/api/visitor/multiplayer/admission' || pathname === '/api/visitor/multiplayer/launch') {
      M.assert(loopback(req), 'Shared Visitor is currently loopback only.');
      M.assert(ctx.account, 'Sign in to an existing HEAT account first.');
      M.assert(multiplayer, stateError || 'Shared Visitor is unavailable.');
      M.assert(Object.keys(data).length === 0, 'Admission uses your signed-in HEAT identity.');
      M.assert(!runningGame(own.id), 'Save and close your local plot before joining shared Visitor.');
      if (pathname.endsWith('/launch') && sharedChildren.has(own.id)) return json(res, 200,
        { ok: true, message: 'Shared Visitor is already open. Use Alt+Tab to switch to it; close it before reconnecting.' });
      const gameKey=accounts.sessionKey(req),admission = multiplayer.issue(own.id, own.display_name, gameKey);
      if (pathname.endsWith('/launch')) {
        M.assert(gameAvailable(), 'The native Godot client is unavailable.');
        const child = spawnGame(path.join(gameRoot, 'recovery/runtime/Godot.exe'), ['--path', path.join(gameRoot, 'playable'),
          '--script', 'scripts/multiplayer_client.gd', '--', '--shared-url=http://' + req.headers.host,
          '--shared-ticket=' + admission.ticket], { cwd: gameRoot, shell: false, windowsHide: false, stdio: 'ignore' });
        sharedChildren.set(own.id, child);
        const clear = () => { if (sharedChildren.get(own.id) === child){sharedChildren.delete(own.id);multiplayer.release(own.id,gameKey);rooms?.returned(own.id,gameKey);} };
        child.once('exit', clear); child.once('error', () => { clear(); launchErrors.set(own.id, 'Shared Visitor could not open. Retry from the channel.'); });
        return json(res, 200, { ok: true, message: 'Shared Visitor opens in a separate window.' });
      }
      return json(res, 200, admission);
    }
    if (pathname.startsWith('/api/visitor/messenger')) {
      if (!ctx.account) return json(res, 401, { error: 'Create or sign in to a HEAT account to use Messenger.' });
      M.assert(messenger && !messenger.error, messenger?.error || 'Messenger is unavailable.');
      let result;
      if (pathname === '/api/visitor/messenger/presence') { messenger.heartbeat(own.id, accounts.sessionKey(req), data.status); result = { ok: true }; }
      else if (pathname === '/api/visitor/messenger/send') result = messenger.send(own.id, data);
      else if (pathname === '/api/visitor/messenger/contact') result = messenger.update(own.id, data);
      else if (pathname === '/api/visitor/messenger/event') result = messenger.openVisit(loopback(req));
      else return json(res, 404, { error: 'Unknown Messenger action.' });
      settleMessenger(); return json(res, 200, result);
    }
    if(pathname.startsWith('/api/visitor/client/da-bomb/')){const ctx=context(req);M.assert(loopback(req)&&ctx.account&&daBomb,'Use the signed-in local HEAT client.');return json(res,200,await daBomb.action(ctx.account.profile_id,accounts.sessionKey(req),pathname.slice('/api/visitor/client/da-bomb/'.length),data));}
    if(pathname.startsWith('/api/visitor/client/'))return json(res,200,await roomAction(req,pathname.slice('/api/visitor/client/'.length),data));
    const files = playerFiles(ctx.account);
    if (pathname === '/api/visitor/profile') {
      M.assert(M.text(data.display_name, 32) && data.display_name.trim(), 'Use a player name between 1 and 32 characters.');
      const next = { ...own, display_name: data.display_name.trim() };
      M.writeIdentity(files.identity, next); if (!ctx.account || ctx.account.legacy) player = next;
      return json(res, 200, { ok: true, identity: next });
    }
    if (pathname === '/api/visitor/import') {
      const report = M.validateReport(data.report);
      M.assert(report.profile.id !== own.id && !accounts.accounts.some(a => a.profile_id === report.profile.id), 'Registered pioneers update directly from 10Six. Import another pioneer for comparison.');
      M.assert(report.generated_unix <= now() + 5, 'That report has a future timestamp.');
      const file = path.join(importDir, report.profile.id + '.json'), old = M.readJSON(file, M.validateReport);
      M.assert(!old || report.generated_unix >= old.generated_unix, 'A newer report from this pioneer is already present.');
      M.atomicJSON(file, report, M.validateReport);
      return json(res, 200, { ok: true, profile_id: report.profile.id, message: 'Pioneer report imported for comparison.' });
    }
    if (pathname === '/api/visitor/launch') {
      M.assert(loopback(req), 'Play on the host PC. LAN browsers can manage accounts; a remote game client is not connected yet.');
      M.assert(!data.profile_id || data.profile_id === own.id, 'Only your signed-in Pioneer can launch here.');
      M.assert(!multiplayer?.status(own.id).joined, 'Close or disconnect your shared Visitor client before launching a local plot.');
      M.assert(gameAvailable(), 'The local 10Six runtime is not configured. Use Connect HEAT.NET.cmd.');
      const running = runningGame(own.id);
      if (running) return json(res, 200, { ok: true, running: true, session_id: running.id, message: '10Six is already running.' });
      const time = now(), id = 'session-' + crypto.randomBytes(16).toString('hex');
      // Settle the previous session before its report file is replaced, even if no browser was open.
      reports();
      const opened = structuredClone(ledger); D.beginSession(opened, id, own.id, time); saveLedger(opened); launchErrors.delete(own.id);
      const args = ['--path', path.join(gameRoot, 'playable'), '--log-file', files.log, '--',
        '--heat-identity=' + files.identity, '--heat-report=' + path.join(reportDir, own.id + '.json'),
        '--heat-save=' + files.save, '--heat-session=' + id, '--heat-started=' + time];
      try {
        const child = spawnGame(path.join(gameRoot, 'recovery/runtime/Godot.exe'), args,
          { cwd: gameRoot, shell: false, windowsHide: false, stdio: 'ignore' }); children.set(own.id, { child, id });
        const close = () => {
          if (children.get(own.id)?.id !== id) return;
          // Keep the final report observable on readback/restart. Session IDs are unique
          // and the cumulative counter makes repeats idempotent; a late flush is safe.
          try { reports(); } catch { launchErrors.set(own.id, 'Launch ended; Degree ledger could not be updated.'); }
          children.delete(own.id);
          if (runningGames.games[own.id]?.id === id) {
            const next = structuredClone(runningGames); delete next.games[own.id];
            try { M.atomicJSON(runningFile, next, validateRunning); runningGames = next; }
            catch { launchErrors.set(own.id, 'The game closed, but its launch registry could not be updated.'); }
          }
        };
        child.once('error', () => { launchErrors.set(own.id, '10Six could not open. No launch-day Degrees were awarded.'); close(); });
        child.once('exit', close);
        if (Number.isSafeInteger(child.pid) && child.pid > 0) {
          const next = structuredClone(runningGames); next.games[own.id] = { pid: child.pid, id };
          try { M.atomicJSON(runningFile, next, validateRunning); runningGames = next; }
          catch { launchErrors.set(own.id, 'The game opened, but its restart guard could not be saved. Keep HEAT.NET running until you close the game.'); }
        }
      } catch { children.delete(own.id); const failed = structuredClone(ledger); failed.sessions[id].closed = true; saveLedger(failed); throw new Error('10Six could not open.'); }
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
      if (!allowedHosts.has(host.split(':')[0]) || !/^[a-z0-9.\-]+(?::\d+)?$/i.test(host)) return json(res, 403, { error: 'Use a configured HEAT.NET address.' });
      const url = new URL(req.url, 'http://' + host), pathname = decodeURIComponent(url.pathname);
      if (pathname.startsWith('/api/visitor')) {
        if (['/api/visitor/multiplayer/connect', '/api/visitor/multiplayer/input', '/api/visitor/multiplayer/state', '/api/visitor/multiplayer/disconnect'].includes(pathname)) {
          M.assert(loopback(req), 'Shared Visitor is currently loopback only.');
          M.assert(multiplayer && !stateError, stateError || 'Shared Visitor is unavailable.');
          M.assert(!req.headers.origin || req.headers.origin === 'http://' + host, 'Use the same HEAT.NET address.');
          if (pathname.endsWith('/state') && req.method === 'GET') return json(res, 200, await multiplayer.state(multiplayer.client(req)));
          if (req.method !== 'POST') return json(res, 405, { error: 'Unsupported shared Visitor method.' });
          const input = await body(req, 16384);
          if (pathname.endsWith('/connect')) {
            M.assert(M.plain(input) && Object.keys(input).length === 1 && typeof input.ticket === 'string', 'Use an admission ticket.');
            return json(res, 200, await multiplayer.connect(input.ticket));
          }
          if (pathname.endsWith('/disconnect')) return json(res, 200, multiplayer.disconnect(req));
          return json(res, 200, await multiplayer.input(multiplayer.client(req), input));
        }
        if(req.method==='GET'&&pathname==='/api/visitor/client'){M.assert(loopback(req),'Use the local HEAT client.');return json(res,200,clientSnapshot(req));}
        if (req.method === 'GET' && pathname === '/api/visitor') return json(res, 200, snapshot(req));
        if (req.method === 'GET' && pathname === '/api/visitor/health') return json(res, 200, { service: 'heat-visitor-bridge', version: 1, capabilities: ['accounts-v1', 'wall-time-v2', 'restart-guard-v1', 'messenger-v1', 'multiplayer-loopback-v1'], lan: allowedHosts.size > 2 });
        if (req.method === 'GET' && pathname === '/api/visitor/messenger') {
          if (!context(req).account) return json(res, 401, { error: 'Sign in to your HEAT account to use Messenger.' });
          M.assert(messenger && !messenger.error, messenger?.error || stateError);
          settleMessenger(); const id = context(req).account.profile_id, peer = url.searchParams.get('player');
          return json(res, 200, peer ? messenger.thread(id, peer, Number(url.searchParams.get('before') || 0)) : messenger.view(id, loopback(req)));
        }
        if (req.method === 'GET' && pathname === '/api/visitor/report') {
          if (!context(req).identity) return json(res, 401, { error: 'Sign in to download a report.' });
          const found = reports().all.find(r => r.profile.id === url.searchParams.get('player'));
          if (!found) return json(res, 404, { error: 'Pioneer report not found.' });
          res.setHeader('Content-Disposition', 'attachment; filename="' + found.profile.id + '.json"');
          delete found.imported; return json(res, 200, found);
        }
        if (req.method === 'POST') return await mutate(req, res, pathname);
        return json(res, 405, { error: 'This Visitor action does not support that method.' });
      }
      if (!['GET', 'HEAD'].includes(req.method)) return json(res, 405, { error: 'Read-only page.' });
      if(pathname.startsWith('/site/client/'))res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
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
  // Ingest native heartbeats even when every browser tab is closed.
  const poll = setInterval(() => { if (!stateError) reports(); }, options.pollMs || 2000);
  poll.unref(); server.once('close', () => { clearInterval(poll); multiplayer?.close();daBomb?.close(); });
  async function playerRequest(req, res, operation, data, worldId) {
    M.assert(req.socket.encrypted && !stateError && multiplayer, stateError || 'Use the secure player gateway.');
    M.assert(multiplayer.status().world_id === worldId, 'Player gateway/world configuration differs.');
    const exact = keys => M.plain(data) && keys.every(key => Object.hasOwn(data, key)) && Object.keys(data).every(key => keys.includes(key));
    const unauthenticated = () => { const error = new Error('Sign in to your existing HEAT account.'); error.playerStatus = 401; throw error; };
    if (operation === 'health') { M.assert(exact([]), 'Health has no player fields.'); return { service: 'heat-player-gateway', ready: (await checkClientWorld(false)).world.ready, world_id: worldId }; }
    if (operation === 'login') { M.assert(exact(['username', 'password']), 'Use HEAT username and password only.'); return { ok: true, account: await accounts.login(req, res, data) }; }
    const account = accounts.current(req), accountKey = accounts.sessionKey(req); if (!account || !accountKey) unauthenticated();
    if (operation === 'logout') { M.assert(exact([]), 'Logout has no player fields.'); accounts.logout(req, res); messenger?.forget(accountKey); rooms?.forget(accountKey);daBomb?.forget(accountKey); if(roomAdmissions.get(account.profile_id)?.key===accountKey)roomAdmissions.delete(account.profile_id); return { ok: true }; }
    if (operation === 'client') {
      M.assert(exact([])&&rooms,'The shared client adapter is not enabled on this HEAT owner.');
      multiplayer.settle();settleMessenger();
      const own=M.identity(playerFiles(account).identity);
      return {version:1,identity:own,auth:{enabled:true,account:accounts.publicAccount(account),can_adopt:false,can_register:false,host_pc:false},
        degrees:D.view(ledger,own.id,now()),trophies:T.view(trophyLedger,own.id),catalog:{visitor:T.VISITOR},rules:D.POLICY,
        multiplayer:multiplayer.status(own.id),client:{version:1,scope:'Desktop HEAT accounts on Toast',coordination:'authenticated-gateway-v1',world:worldCheck,
          games:[{id:'10six',title:'10Six',subtitle:'Planet Visitor',supported:true,installed:false,running:multiplayer.connected(own.id),joined:multiplayer.status(own.id).joined,local_plot:false,artwork:'/site/images/games/10six_shoot_45.jpg'},
          ...(daBomb?[{...daBomb.game(own.id),installed:false,running:false}]:[]),
          {id:'quake2',title:'Quake II',supported:false,installed:false,reason:'Client integration and multiplayer verification are still pending.'},
          {id:'scud',title:'Scud',supported:false,installed:false,reason:'Client integration and multiplayer verification are still pending.'}]},
        room:rooms.view(own.id,accountKey),rooms:daBomb?{'da-bomb':daBomb.view(own.id,accountKey)}:{}};
    }
    if (operation === 'room') { M.assert(exact(['action','data'])&&typeof data.action==='string'&&M.plain(data.data),'Use a bounded room action.'); return roomAction(req,data.action,data.data,true); }
    if (operation === 'dabomb') {M.assert(daBomb&&exact(['action','data'])&&typeof data.action==='string'&&M.plain(data.data),'Use a bounded Da Bomb room action.');return daBomb.action(account.profile_id,accountKey,data.action,data.data,true);}
    if (operation === 'messenger') {
      M.assert(rooms&&messenger&&!messenger.error,'The authenticated Messenger adapter is unavailable.');
      M.assert(exact(['action','data'])&&M.plain(data.data),'Use a bounded Messenger action.');
      const input=data.data, fields=keys=>M.plain(input)&&Object.keys(input).sort().join(',')===keys.sort().join(',');
      let result;
      if(data.action==='view'){M.assert(fields([]),'Directory uses your signed-in account.');result=messenger.view(account.profile_id,false);}
      else if(data.action==='thread'){M.assert(fields(['player','before']),'Use a player and history position.');result=messenger.thread(account.profile_id,input.player,input.before);}
      else if(data.action==='presence'){M.assert(fields(['status']),'Use a presence status.');messenger.heartbeat(account.profile_id,accountKey,input.status);result={ok:true};}
      else if(data.action==='send'){M.assert(fields(['to','text','request_id']),'Use a recipient, message and retry ID.');result=messenger.send(account.profile_id,input);}
      else if(data.action==='contact'){M.assert(fields(input.action==='read'?['player','action','through']:['player','action','enabled']),'Use a bounded contact action.');result=messenger.update(account.profile_id,input);}
      else throw new Error('Unsupported authenticated Messenger action.');
      settleMessenger();return result;
    }
    if (operation === 'summary') { M.assert(exact([]), 'Summary uses your HEAT identity.'); multiplayer.settle(); return { account: accounts.publicAccount(account), degrees: D.view(ledger, account.profile_id, now()), trophies: T.view(trophyLedger, account.profile_id) }; }
    if (operation === 'admission') { M.assert(exact([]), 'Admission uses your HEAT identity.'); const own = M.identity(playerFiles(account).identity); return multiplayer.issue(own.id, own.display_name, accountKey); }
    if (operation === 'connect') { M.assert(exact(['ticket']) && typeof data.ticket === 'string', 'Use a player admission ticket.'); return multiplayer.connect(data.ticket, accountKey); }
    M.assert(['state', 'input', 'disconnect'].includes(operation), 'Unsupported player action.');
    const client = multiplayer.client(req); if (client.accountKey !== accountKey) { const error = new Error('Sign in with the HEAT session that owns this native client.'); error.playerStatus = 403; throw error; }
    if (operation === 'state') { M.assert(exact([]), 'State has no report fields.'); return multiplayer.state(client); }
    if (operation === 'disconnect') { M.assert(exact([]), 'Disconnect has no report fields.'); const result=multiplayer.disconnect(req);rooms?.returned(account.profile_id,accountKey);if(roomAdmissions.get(account.profile_id)?.key===accountKey)roomAdmissions.delete(account.profile_id);return result; }
    return multiplayer.input(client, data);
  }
  return { server, snapshot, clientSnapshot, clientActiveGames: () => activeGameCount(), playerRequest, get identity() { return player; }, ledgerFile, reportDir, stateDir };
}
module.exports = { createVisitorServer, validateLedger, validateTrophies };

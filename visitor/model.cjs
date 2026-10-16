'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const PROFILE_ID = /^local-[a-f0-9]{32}$/;
const SESSION_ID = /^session-[a-f0-9]{32}$/;
const HEX = /^[a-f0-9]{64}$/;
const MAX_REPORT = 2 * 1024 * 1024;
function plain(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function number(v, min = 0) { return typeof v === 'number' && Number.isFinite(v) && v >= min; }
function integer(v, min = 0) { return Number.isSafeInteger(v) && v >= min; }
function text(v, max = 100) { return typeof v === 'string' && v.length <= max && !/[\x00-\x1f\x7f]/.test(v); }
function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted);
  if (plain(value)) return Object.fromEntries(Object.keys(value).sort().map(k => [k, sorted(value[k])]));
  return value;
}
function canonical(v) { return JSON.stringify(sorted(v)); }
function assert(ok, message) { if (!ok) throw new Error(message); }
function keys(v, required, optional = []) {
  return plain(v) && required.every(k => Object.hasOwn(v, k)) && Object.keys(v).every(k => required.includes(k) || optional.includes(k));
}
function validateReport(report) {
  assert(plain(report) && report.schema === '10six.heat-report' && report.version === 1, 'Unsupported Visitor report version.');
  assert(keys(report, ['schema', 'version', 'generated_unix', 'source', 'profile', 'camps', 'registry', 'aggregate', 'carried_items', 'activity',
    'awards', 'canonical_payload', 'sha256', 'report_id'], ['session']), 'Unknown report fields are not imported.');
  assert(typeof report.canonical_payload === 'string' && Buffer.byteLength(report.canonical_payload) <= MAX_REPORT, 'Report has no verifiable payload.');
  assert(HEX.test(report.sha256 || '') && report.report_id === 'report-' + report.sha256, 'Invalid report identity.');
  assert(crypto.createHash('sha256').update(report.canonical_payload, 'utf8').digest('hex') === report.sha256, 'Visitor report checksum failed.');
  const facts = { ...report }; delete facts.canonical_payload; delete facts.report_id; delete facts.sha256;
  let payload; try { payload = JSON.parse(report.canonical_payload); } catch { throw new Error('Malformed report payload.'); }
  assert(canonical(payload) === canonical(facts), 'Report fields do not match their checked payload.');
  assert(number(report.generated_unix) && plain(report.source) && report.source.authority === 'local_reconstruction' &&
    report.source.persistence === 'catch_up_on_return' && report.source.running_server === false, 'Unsupported report authority.');
  assert(text(report.source.world) && text(report.source.ruleset), 'Invalid report source.');
  const p = report.profile;
  assert(keys(report.source, ['authority', 'persistence', 'running_server', 'world', 'ruleset', 'classification']) &&
    report.source.classification === 'RESTORED' && keys(p, ['id', 'display_name', 'corporation', 'current_camp', 'home_camp', 'health', 'equipped_weapon_id']) &&
    number(p.health) && integer(p.equipped_weapon_id), 'Invalid report source or profile fields.');
  assert(plain(p) && PROFILE_ID.test(p.id || '') && text(p.display_name, 32) && p.display_name.trim().length > 0, 'Invalid player profile.');
  assert(['', 'bruteforce', 'extreme', 'infrastruct', 'toyco'].includes(p.corporation) && integer(p.current_camp) && integer(p.home_camp), 'Invalid player camp.');
  assert(Array.isArray(report.camps) && report.camps.length <= 2500 && Array.isArray(report.registry) && report.registry.length <= 2500 &&
    Array.isArray(report.activity) && report.activity.length <= 250000 && Array.isArray(report.carried_items) && plain(report.aggregate), 'Invalid report collections.');
  const camps = new Set();
  const metrics = ['tu', 'capacity', 'mined', 'built', 'recovered', 'ready_buildings', 'ready_rovers', 'ready_defenses', 'repelled', 'observed_losses'];
  for (const c of report.camps) {
    assert(keys(c, ['number', 'label', 'owner_id', 'owner_display_name', 'corporation', 'home', 'current', 'claimed_unix', 'age_days',
      'state_unix', 'freshness', 'ruleset', 'tick', 'metrics', 'inventory', 'log_window', 'last_raid']) && integer(c.tick) &&
      ['current_snapshot', 'stored_snapshot', 'unknown_time'].includes(c.freshness), 'Invalid camp fields.');
    assert(plain(c) && integer(c.number) && !camps.has(c.number) && text(c.label) && number(c.state_unix) && plain(c.metrics), 'Invalid or duplicate camp.');
    assert(c.owner_id === '' || PROFILE_ID.test(c.owner_id || ''), 'Invalid camp owner.');
    assert(text(c.owner_display_name, 64) && ['', 'bruteforce', 'extreme', 'infrastruct', 'toyco'].includes(c.corporation), 'Invalid camp identity.');
    assert(typeof c.home === 'boolean' && typeof c.current === 'boolean' && number(c.claimed_unix) && integer(c.age_days) && text(c.ruleset), 'Invalid camp state.');
    for (const key of metrics) assert(number(c.metrics[key]), 'Invalid camp metric: ' + key);
    assert(keys(c.metrics, [...metrics, 'raid_wave', 'raid_active', 'raiders'], ['nerve_center_online']) && integer(c.metrics.raid_wave) &&
      integer(c.metrics.raiders) && typeof c.metrics.raid_active === 'boolean' &&
      (!Object.hasOwn(c.metrics, 'nerve_center_online') || typeof c.metrics.nerve_center_online === 'boolean'), 'Invalid combat metrics.');
    const locations = ['pack', 'equipment', 'storage', 'producing', 'ready', 'mounted', 'built', 'ground', 'destroyed'];
    assert(keys(c.inventory, locations) && Object.values(c.inventory).every(v => integer(v)), 'Invalid camp inventory.');
    assert(keys(c.log_window, ['retained_entries', 'limit', 'complete_history', 'oldest_unix', 'newest_unix']) &&
      c.log_window.complete_history === false && integer(c.log_window.retained_entries) && integer(c.log_window.limit) &&
      c.log_window.retained_entries <= c.log_window.limit && c.log_window.limit <= 10000 && number(c.log_window.oldest_unix) &&
      number(c.log_window.newest_unix) && c.log_window.oldest_unix <= c.log_window.newest_unix, 'Invalid camp log window.');
    assert(plain(c.last_raid), 'Invalid last raid.');
    if (Object.keys(c.last_raid).length) assert(keys(c.last_raid, ['wave', 'started_unix', 'repelled', 'loss_count', 'losses', 'window_limited']) &&
      integer(c.last_raid.wave) && number(c.last_raid.started_unix) && typeof c.last_raid.repelled === 'boolean' &&
      integer(c.last_raid.loss_count) && plain(c.last_raid.losses) && c.last_raid.window_limited === true &&
      Object.entries(c.last_raid.losses).every(([k, v]) => text(k, 64) && integer(v)) &&
      Object.values(c.last_raid.losses).reduce((n, v) => n + v, 0) === c.last_raid.loss_count, 'Invalid raid summary.');
    camps.add(c.number);
  }
  assert(camps.has(p.current_camp), 'Present camp is missing from the report.');
  assert(report.camps.filter(c => c.current).length === 1 && report.camps.find(c => c.current).number === p.current_camp, 'Current camp is inconsistent.');
  const claims = new Set();
  for (const c of report.registry) {
    assert(keys(c, ['number', 'owner_id', 'owner_display_name', 'corporation', 'home', 'claimed_unix']) && typeof c.home === 'boolean', 'Invalid registry fields.');
    assert(plain(c) && integer(c.number, 1) && !claims.has(c.number) && (c.owner_id === '' || PROFILE_ID.test(c.owner_id || '')) &&
      text(c.owner_display_name, 64) && ['bruteforce', 'extreme', 'infrastruct', 'toyco'].includes(c.corporation) && number(c.claimed_unix), 'Invalid registry claim.');
    claims.add(c.number);
  }
  for (const key of [...metrics, 'visited_camps', 'owned_camps']) assert(number(report.aggregate[key]), 'Invalid aggregate: ' + key);
  assert(keys(report.aggregate, [...metrics, 'visited_camps', 'owned_camps']), 'Invalid aggregate fields.');
  assert(report.aggregate.visited_camps === report.camps.length, 'Camp count is inconsistent.');
  assert(report.aggregate.owned_camps === report.camps.filter(c => c.owner_id === p.id).length, 'Ownership count is inconsistent.');
  for (const key of metrics) {
    const expected = report.camps.reduce((n, c) => n + c.metrics[key], 0);
    assert(Math.abs(expected - report.aggregate[key]) <= Math.max(0.00001, Math.abs(expected) * 1e-12), 'Aggregate is inconsistent: ' + key);
  }
  const activityIds = new Set();
  const details = { claimed: ['camp'], raid: ['wave', 'raiders'], repelled: ['wave'], lost: ['kind', 'durability'],
    absorbed: ['kind', 'built'], downed: ['cost'], away: ['seconds', 'mined', 'spent', 'tu'] };
  for (const e of report.activity) {
    assert(keys(e, ['id', 'camp', 'type', 'tick', 'unix', 'details']) && details[e.type] && keys(e.details, details[e.type]), 'Invalid activity fields.');
    assert(plain(e) && /^event-[a-f0-9]{64}$/.test(e.id || '') && !activityIds.has(e.id) && camps.has(e.camp) &&
      ['claimed', 'raid', 'repelled', 'lost', 'absorbed', 'downed', 'away'].includes(e.type) && integer(e.tick) && number(e.unix) && plain(e.details), 'Invalid camp activity.');
    for (const [k, v] of Object.entries(e.details)) assert(k === 'kind' ? text(v, 64) : k === 'built' ? typeof v === 'boolean' : number(v), 'Invalid activity detail.');
    activityIds.add(e.id);
  }
  const itemIds = new Set();
  for (const i of report.carried_items) {
    assert(keys(i, ['id', 'kind', 'durability', 'location']), 'Invalid carried-item fields.');
    assert(plain(i) && integer(i.id, 1) && !itemIds.has(i.id) && text(i.kind, 40) && integer(i.durability) && ['pack', 'equipment'].includes(i.location), 'Invalid carried item.');
    itemIds.add(i.id);
  }
  assert(keys(report.awards, ['policy', 'evidence', 'granted']) && report.awards.policy === 'existing_heat_rules' && report.awards.evidence === 'game_facts_only' &&
    Array.isArray(report.awards.granted) && report.awards.granted.length === 0, 'Reports cannot grant trophies or Degrees.');
  if (report.session) assert(keys(report.session, ['id', 'started_unix', 'active_seconds']) && SESSION_ID.test(report.session.id || '') && number(report.session.started_unix, 1) &&
    report.session.started_unix <= report.generated_unix && number(report.session.active_seconds) &&
    report.session.active_seconds <= report.generated_unix - report.session.started_unix + 1, 'Invalid gameplay session.');
  return report;
}
function readJSON(file, validator) {
  if (!fs.existsSync(file)) return null;
  assert(fs.statSync(file).size <= MAX_REPORT * 8, 'Local state file exceeds its size limit.');
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  return validator ? validator(data) : data;
}
function atomicJSON(file, data, validator) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${crypto.randomBytes(8).toString('hex')}.tmp`;
  try {
    require('./checked-json.cjs').writeCheckedJSON(tmp,JSON.stringify(data,null,2)+'\n',validator,MAX_REPORT*8);
    if (fs.existsSync(file)) fs.copyFileSync(file, file + '.bak');
    fs.renameSync(tmp, file);
  } finally { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); }
}
function identity(file) {
  let envelope = readJSON(file);
  if (!envelope) {
    const data = { id: 'local-' + crypto.randomBytes(16).toString('hex'), display_name: 'Pioneer' };
    writeIdentity(file, data); envelope = readJSON(file);
  }
  const data = envelope.identity;
  assert(envelope.schema === '10six.heat-identity' && envelope.version === 1 && plain(data) && PROFILE_ID.test(data.id || '') &&
    text(data.display_name, 32) && data.display_name.trim() && envelope.sha256 === crypto.createHash('sha256').update(canonical(data)).digest('hex'),
    'Local profile needs recovery; its identity was preserved.');
  return data;
}
function writeIdentity(file, data) {
  atomicJSON(file, { schema: '10six.heat-identity', version: 1, identity: data,
    sha256: crypto.createHash('sha256').update(canonical(data)).digest('hex') });
}
module.exports = { PROFILE_ID, SESSION_ID, MAX_REPORT, plain, number, integer, text, canonical, validateReport, readJSON, atomicJSON, identity, writeIdentity, assert };

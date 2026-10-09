'use strict';

// The preserved GET PAID TO PLAY page, lines 891-904. Lobby eligibility is
// contradictory in the archive; this restoration counts gameplay only.
const POLICY = Object.freeze({
  id: 'heat-archive-gameplay-v1', classification: 'RESTORED',
  timezone: 'America/Chicago', daily: 100, hour: 250,
  fifteen_days: 5000, full_month: 10000, full_year: 500000,
  source: '/original_archive/HEAT.NET%20__%20GET%20PAID%20TO%20PLAY.htm',
  basis: 'Preserved HEAT.NET GET PAID TO PLAY page, lines 891-904',
  gameplay_only: true, redemption_available: false,
});

function newLedger() { return { version: 1, profiles: {}, sessions: {} }; }
function dayKey(unix) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: POLICY.timezone,
    year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(unix * 1000));
  const p = Object.fromEntries(parts.map(v => [v.type, v.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
function daysInMonth(key) { const [y, m] = key.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
function daysInYear(y) { return new Date(Date.UTC(Number(y), 1, 29)).getUTCMonth() === 1 ? 366 : 365; }
function profile(ledger, id) {
  return ledger.profiles[id] ||= { balance: 0, gameplay_seconds: 0, launch_days: [], transactions: [] };
}
function credit(p, id, unix, amount, reason) {
  if (p.transactions.some(t => t.id === id)) return;
  p.balance += amount;
  p.transactions.push({ id, unix, amount, reason });
}
function bonuses(p, date, unix) {
  const month = date.slice(0, 7), year = date.slice(0, 4);
  const monthly = p.launch_days.filter(d => d.startsWith(month + '-')).length;
  const yearly = p.launch_days.filter(d => d.startsWith(year + '-')).length;
  if (monthly >= 15) credit(p, `month15:${month}`, unix, POLICY.fifteen_days, 'Launch on 15 days this month');
  if (monthly === daysInMonth(month)) credit(p, `monthall:${month}`, unix, POLICY.full_month, 'Launch every day this month');
  if (yearly === daysInYear(year)) credit(p, `yearall:${year}`, unix, POLICY.full_year, 'Launch every day this year');
}
function beginSession(ledger, id, profileId, unix) {
  if (ledger.sessions[id]) throw new Error('That launch session already exists.');
  ledger.sessions[id] = { profile_id: profileId, started_unix: unix, last_unix: unix,
    active_seconds: 0, confirmed: false, closed: false, connected_days: [] };
}
function observe(ledger, report, now) {
  const data = report.session, session = data && ledger.sessions[data.id];
  if (!session || session.closed || session.profile_id !== report.profile.id) return false;
  // A report imported from another player cannot invent an earning session.
  if (Math.abs(data.started_unix - session.started_unix) > 1 || report.generated_unix > now + 5 || report.generated_unix < session.last_unix) return false;
  const seconds = data.active_seconds;
  if (!Number.isFinite(seconds) || seconds < session.active_seconds || seconds > now - session.started_unix + 1) return false;
  const p = profile(ledger, session.profile_id);
  const previousHours = Math.floor(p.gameplay_seconds / 3600);
  p.gameplay_seconds += Math.max(0, seconds - session.active_seconds);
  session.active_seconds = seconds; session.last_unix = report.generated_unix; session.confirmed = true;
  const date = dayKey(session.started_unix);
  // The native client must actually enter Visitor: clicking launch alone earns nothing.
  if (!p.launch_days.includes(date)) {
    p.launch_days.push(date); p.launch_days.sort();
    session.connected_days.push(date);
    credit(p, `daily:${date}`, report.generated_unix, POLICY.daily, 'Log in and launch a game');
  }
  for (let hour = previousHours + 1; hour <= Math.floor(p.gameplay_seconds / 3600); hour++)
    credit(p, `hour:${hour}`, report.generated_unix, POLICY.hour, '60 minutes of gameplay');
  bonuses(p, date, report.generated_unix);
  return true;
}
function view(ledger, id, unix) {
  const p = ledger.profiles[id] || { balance: 0, gameplay_seconds: 0, launch_days: [], transactions: [] };
  const date = dayKey(unix), month = date.slice(0, 7), year = date.slice(0, 4);
  const transactions = p.transactions.slice().reverse();
  return { balance: p.balance, gameplay_seconds: p.gameplay_seconds, attendance_days: p.launch_days.length,
    transactions, ledger: transactions, policy: 'archived_heat_rules', timezone: POLICY.timezone,
    status: 'local_restoration', progress: {
      month_launch_days: p.launch_days.filter(d => d.startsWith(month + '-')).length,
      days_in_month: daysInMonth(month), year_launch_days: p.launch_days.filter(d => d.startsWith(year + '-')).length,
      days_in_year: daysInYear(year), active_seconds: p.gameplay_seconds,
      minutes_to_next_hour: Math.ceil((3600 - (p.gameplay_seconds % 3600)) / 60),
    } };
}
function creditOzymandias(ledger, id, day, unix) {
  const p = profile(ledger, id), key = 'ozymandias:' + day;
  if (p.transactions.some(t => t.id === key)) return false;
  credit(p, key, unix, require('./messenger-policy.json').ozymandias.degrees, 'First to page OZYMANDIAS — local event recreation'); return true;
}
module.exports = { POLICY, newLedger, dayKey, daysInMonth, daysInYear, beginSession, observe, view, creditOzymandias };

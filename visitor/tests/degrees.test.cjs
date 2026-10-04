'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const D = require('../degrees.cjs');
const profile = 'local-' + '1'.repeat(32);
const unix = day => Date.parse(day + 'T18:00:00Z') / 1000;
function launch(l, when, seconds = 0, ordinal = 1) {
  const id = 'session-' + ordinal.toString(16).padStart(32, '0');
  D.beginSession(l, id, profile, when);
  const report = { profile: { id: profile }, generated_unix: when + seconds,
    session: { id, started_unix: when, active_seconds: seconds } };
  D.observe(l, report, when + seconds); return report;
}
test('launch alone awards nothing; one real confirmed launch earns 100 once', () => {
  const l = D.newLedger(), when = unix('2026-10-03');
  D.beginSession(l, 'session-' + '0'.repeat(32), profile, when);
  assert.equal(D.view(l, profile, when).balance, 0);
  const report = launch(l, when, 0);
  assert.equal(D.view(l, profile, when).balance, 100);
  D.observe(l, report, when); launch(l, when + 30, 0, 2);
  assert.equal(D.view(l, profile, when).balance, 100);
});
test('hours carry across sessions; replay, pauses and offline absence do not mint play time', () => {
  const l = D.newLedger(), when = unix('2026-10-03');
  const first = launch(l, when, 1800);
  D.observe(l, first, when + 86400);
  assert.equal(D.view(l, profile, when).gameplay_seconds, 1800);
  const second = launch(l, when + 3600, 1800, 2);
  assert.equal(D.view(l, profile, when).balance, 350);
  D.observe(l, second, when + 86400);
  assert.equal(D.view(l, profile, when).balance, 350);
  const decreased = structuredClone(second); decreased.session.active_seconds = 10;
  assert.equal(D.observe(l, decreased, when + 86400), false);
  assert.equal(D.view(l, profile, when).gameplay_seconds, 3600);
  const older = structuredClone(second); older.generated_unix--;
  assert.equal(D.observe(l, older, when + 86400), false);
});
test('Chicago launch calendar, midnight continuity and year boundary are exact', () => {
  assert.equal(D.dayKey(Date.parse('2026-01-01T05:59:59Z') / 1000), '2025-12-31');
  assert.equal(D.dayKey(Date.parse('2026-01-01T06:00:00Z') / 1000), '2026-01-01');
  const l = D.newLedger(), when = Date.parse('2026-10-04T04:59:00Z') / 1000;
  const report = launch(l, when, 120);
  assert.deepEqual(l.profiles[profile].launch_days, ['2026-10-03']);
  D.observe(l, report, when + 1000);
  assert.equal(l.profiles[profile].balance, 100);
});
test('15-day and full-month bonuses stack once; leap-year lengths are correct', () => {
  const l = D.newLedger();
  for (let day = 1; day <= 28; day++) launch(l, unix(`2027-02-${String(day).padStart(2, '0')}`), 0, day);
  assert.equal(l.profiles[profile].balance, 28 * 100 + 5000 + 10000);
  launch(l, unix('2027-02-28') + 30, 0, 29);
  assert.equal(l.profiles[profile].balance, 17800);
  assert.equal(D.daysInMonth('2028-02'), 29);
  assert.equal(D.daysInYear('2028'), 366);
  assert.equal(D.daysInYear('2100'), 365);
});
test('full year stacks with all 12 monthly awards, and missing a date prevents yearly bonus', () => {
  for (const [year, count] of [[2027, 365], [2028, 366]]) {
    const l = D.newLedger(), start = unix(`${year}-01-01`);
    for (let n = 0; n < count; n++) launch(l, start + n * 86400, 0, n + 1);
    assert.equal(l.profiles[profile].balance, count * 100 + 12 * 15000 + 500000);
    assert.equal(l.profiles[profile].transactions.filter(t => t.id.startsWith('yearall:')).length, 1);
  }
  const l = D.newLedger(), start = unix('2027-01-01');
  for (let n = 1; n < 365; n++) launch(l, start + n * 86400, 0, n);
  assert.equal(l.profiles[profile].transactions.some(t => t.id.startsWith('yearall:')), false);
});
test('unrecognized, wrong-owner, impossible, closed and future sessions earn nothing', () => {
  const l = D.newLedger(), when = unix('2026-10-03'), report = launch(l, when, 0);
  const before = JSON.stringify(l);
  const wrong = structuredClone(report); wrong.profile.id = 'local-' + '2'.repeat(32);
  assert.equal(D.observe(l, wrong, when), false);
  const fake = structuredClone(report); fake.session.id = 'session-' + 'f'.repeat(32);
  assert.equal(D.observe(l, fake, when), false);
  const jump = structuredClone(report); jump.session.active_seconds = 7200;
  assert.equal(D.observe(l, jump, when + 1), false);
  const future = structuredClone(report); future.generated_unix = when + 10;
  assert.equal(D.observe(l, future, when), false);
  assert.equal(JSON.stringify(l), before);
  l.sessions[report.session.id].closed = true;
  assert.equal(D.observe(l, report, when + 7200), false);
});

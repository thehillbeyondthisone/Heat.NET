'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const T = require('../trophies.cjs');
const { validateTrophies } = require('../server.cjs');

// Authored unit fixtures: no player saves, downloaded report or file writes.
// Full report integrity and local/import routing are covered by server.test.cjs.
const pioneer = 'local-' + 'a'.repeat(32);
const other = 'local-' + 'b'.repeat(32);
const observedAt = 1791046800;
const reportId = 'report-' + 'c'.repeat(64);
function camp(number, online, owner = pioneer) {
  const metrics = { ready_buildings: 99, built: 99 };
  if (online !== undefined) metrics.nerve_center_online = online;
  return { number, owner_id: owner, metrics };
}
function claim(number, owner = pioneer) { return { number, owner_id: owner }; }
function report(camps, registry = camps.map(c => claim(c.number, c.owner_id))) {
  return { profile: { id: pioneer }, camps, registry, generated_unix: observedAt - 86400, report_id: reportId };
}
function ids(ledger, owner = pioneer) { return T.view(ledger, owner).granted.map(g => g.id).sort(); }

test('only the two approved Visitor milestones are active; community recognition remains proposed', () => {
  assert.deepEqual(T.VISITOR.map(t => t.id).sort(), ['visitor-first-claim', 'visitor-two-camps']);
  assert.ok(T.VISITOR.every(t => t.classification === 'EXPANSION' && t.status === 'active' && t.grantable === true));
  const view = T.view(T.newLedger(), pioneer);
  assert.deepEqual(view.granted, []);
  assert.ok(view.proposals.some(t => t.id === 'visitor-community-tester' && t.status === 'proposed'));
  assert.equal(validateTrophies(T.newLedger()).version, 1);
});

test('unknown, unfinished and destroyed Nerve Centers do not qualify through generic building counts', () => {
  for (const online of [undefined, false, null, 0, 1, 'true']) {
    const ledger = T.newLedger();
    assert.equal(T.observe(ledger, report([camp(201, online), camp(202, online)]), observedAt), false);
    assert.deepEqual(ids(ledger), []);
    assert.equal(validateTrophies(ledger), ledger);
  }
});

test('one completed owned claim earns First Claim without inferring a second from unfinished construction', () => {
  const ledger = T.newLedger();
  const r = report([camp(201, true), camp(202, false), camp(203, undefined)]);
  assert.equal(T.observe(ledger, r, observedAt), true);
  assert.deepEqual(ids(ledger), ['visitor-first-claim']);
  const grant = T.view(ledger, pioneer).granted[0];
  assert.equal(grant.unix, observedAt, 'A previously saved claim is recognized now, never backdated.');
  assert.equal(grant.report_id, reportId);
  assert.equal(grant.classification, 'EXPANSION');
  validateTrophies(ledger);
});

test('both camp facts and the matching registry must identify the report Pioneer as owner', () => {
  const cases = [
    report([camp(201, true)], []),
    report([camp(201, true)], [claim(201, other)]),
    report([camp(201, true)], [claim(202)]),
    report([camp(201, true, other)], [claim(201)]),
    report([camp(201, true, other)], [claim(201, other)]),
  ];
  for (const r of cases) {
    const ledger = T.newLedger();
    assert.equal(T.observe(ledger, r, observedAt), false);
    assert.deepEqual(ids(ledger), []);
    assert.deepEqual(ids(ledger, other), []);
    validateTrophies(ledger);
  }
});

test('Two-Camp Pioneer requires two distinct qualified camp numbers', () => {
  const duplicate = T.newLedger();
  T.observe(duplicate, report([camp(201, true), camp(201, true)], [claim(201)]), observedAt);
  assert.deepEqual(ids(duplicate), ['visitor-first-claim']);
  validateTrophies(duplicate);

  const ledger = T.newLedger();
  const r = report([camp(201, true), camp(202, true)]);
  assert.equal(T.observe(ledger, r, observedAt), true);
  assert.deepEqual(ids(ledger), ['visitor-first-claim', 'visitor-two-camps']);
  validateTrophies(ledger);
});

test('replayed reports do not duplicate grants or change recognition time after persistence round-trip', () => {
  const ledger = T.newLedger();
  const r = report([camp(201, true), camp(202, true)]);
  assert.equal(T.observe(ledger, r, observedAt), true);
  const serialized = JSON.stringify(ledger);
  const restored = validateTrophies(JSON.parse(serialized));
  assert.equal(T.observe(restored, r, observedAt + 86400), false);
  const later = structuredClone(r);
  later.report_id = 'report-' + 'd'.repeat(64);
  later.generated_unix = observedAt + 86400;
  assert.equal(T.observe(restored, later, observedAt + 86400), false);
  assert.equal(JSON.stringify(restored), serialized);
});

test('later second-claim recognition preserves the first grant, and later camp loss preserves both', () => {
  const ledger = T.newLedger();
  T.observe(ledger, report([camp(201, true)]), observedAt);
  T.observe(ledger, report([camp(201, true), camp(202, true)]), observedAt + 3600);
  const grants = T.view(ledger, pioneer).granted;
  assert.equal(grants.find(g => g.id === 'visitor-first-claim').unix, observedAt);
  assert.equal(grants.find(g => g.id === 'visitor-two-camps').unix, observedAt + 3600);
  const prior = JSON.stringify(ledger);
  assert.equal(T.observe(ledger, report([camp(201, false), camp(202, true, other)], [claim(202, other)]), observedAt + 7200), false);
  assert.equal(JSON.stringify(ledger), prior);
  assert.deepEqual(ids(ledger), ['visitor-first-claim', 'visitor-two-camps']);
  validateTrophies(ledger);
});

test('historical, duplicate, malformed and misclassified grants are rejected on ledger readback', () => {
  const ledger = T.newLedger();
  T.observe(ledger, report([camp(201, true)]), observedAt);
  for (const modify of [
    grant => { grant.id = 'charter-member'; },
    grant => { grant.id = '10six-tester'; },
    grant => { grant.id = 'visitor-community-tester'; },
    grant => { grant.classification = 'ORIGINAL'; },
    grant => { grant.report_id = 'unverified'; },
    grant => { grant.unix = -1; },
  ]) {
    const damaged = structuredClone(ledger);
    modify(damaged.profiles[pioneer][0]);
    assert.throws(() => validateTrophies(damaged), /Invalid Visitor award/);
  }
  const duplicate = structuredClone(ledger);
  duplicate.profiles[pioneer].push(structuredClone(duplicate.profiles[pioneer][0]));
  assert.throws(() => validateTrophies(duplicate), /Invalid Visitor award/);
});

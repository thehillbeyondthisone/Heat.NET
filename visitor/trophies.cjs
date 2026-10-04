'use strict';
// New Visitor milestone awards, approved October 3, 2026. The original HEAT
// trophies retain their documented dated-event/community selection rules.
const VISITOR = [
  { id: 'visitor-first-claim', name: 'First Claim', classification: 'EXPANSION', status: 'active',
    description: 'Establish a Visitor claim with a completed Nerve Center.',
    image_url: '/site/images/visitor-trophies/first-claim.svg', verified: true, grantable: true },
  { id: 'visitor-two-camps', name: 'Two-Camp Pioneer', classification: 'EXPANSION', status: 'active',
    description: 'Hold two Visitor claims with completed Nerve Centers at the same time.',
    image_url: '/site/images/visitor-trophies/two-camps.svg', verified: true, grantable: true },
];
function newLedger() { return { version: 1, profiles: {} }; }
function observe(ledger, report, unix) {
  const owned = new Set(report.camps.filter(c => c.owner_id === report.profile.id && c.metrics.nerve_center_online === true &&
    report.registry.some(claim => claim.number === c.number && claim.owner_id === report.profile.id)).map(c => c.number));
  const earned = [];
  if (owned.size >= 1) earned.push(VISITOR[0]);
  if (owned.size >= 2) earned.push(VISITOR[1]);
  if (!earned.length) return false;
  const grants = ledger.profiles[report.profile.id] ||= [];
  let changed = false;
  for (const trophy of earned) if (!grants.some(g => g.id === trophy.id)) {
    grants.push({ id: trophy.id, unix, report_id: report.report_id, reason: trophy.description, classification: 'EXPANSION' });
    changed = true;
  }
  return changed;
}
function view(ledger, profileId) {
  return { granted: (ledger.profiles[profileId] || []).slice(), policy: 'approved_visitor_milestones_v1',
    classification: 'EXPANSION', proposals: [
      { id: 'visitor-community-tester', name: 'Revived 10SIX Community Tester', classification: 'EXPANSION', status: 'proposed',
        description: 'Community recognition for testing and helping pioneers; selection criteria await review.' },
    ] };
}
module.exports = { VISITOR, newLedger, observe, view };

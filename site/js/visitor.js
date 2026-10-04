/* HEAT.NET reads validated local Visitor reports. No fixture players or inferred awards. */
(() => {
  'use strict';
  const page = document.body.dataset.visitorPage;
  if (!page) return;
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));
  const rendered = new WeakMap();
  const trophyArt = new Set(['6160.gif', '6142.gif', '6143.gif', '6145.gif']);
  const state = { data: null, selected: new URLSearchParams(location.search).get('player') || '', busy: false, launchBusy: false, lastSuccess: 0, identityName: '', playersCount: 0 };
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (value) => Number.isFinite(Number(value)) && value !== null && value !== '' ? Number(value).toLocaleString('en-US', { maximumFractionDigits: 1 }) : '—';
  const entries = () => state.data?.profiles || [];
  const ownId = () => state.data?.selected_profile_id || '';
  const report = () => entries().find((r) => r.profile?.id === state.selected);
  const faction = (name) => ({ bruteforce: 'BruteForce', extreme: 'eXtreme', infrastruct: 'InfraStruct', toyco: 'ToyCo' }[String(name).toLowerCase()] || name || 'Unassigned');
  const empty = (title, copy) => `<div class="empty"><strong>${esc(title)}</strong>${esc(copy)}</div>`;
  const profileUrl = (path, id) => `${path}?player=${encodeURIComponent(id)}`;
  const pickerName = (r) => `${r.profile.display_name}${entries().filter((other) => other.profile.display_name === r.profile.display_name).length > 1 ? ' · ' + r.profile.id.slice(-6) : ''}`;
  function time(unix) {
    if (!(Number(unix) > 0)) return 'Time not recorded';
    const date = new Date(Number(unix) * 1000);
    if (!Number.isFinite(date.getTime())) return 'Time not recorded';
    return date.toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  }
  function timeHtml(unix) {
    if (!(Number(unix) > 0)) return '<span class="muted">Time not recorded</span>';
    return `<time datetime="${esc(new Date(Number(unix) * 1000).toISOString())}">${esc(time(unix))}</time>`;
  }
  function setHtml(selector, html) {
    const el = $(selector);
    if (!el || rendered.get(el) === html) return;
    const scrolls = Array.from(el.querySelectorAll('.table-scroll')).map((s) => s.scrollLeft);
    const openDetails = Array.from(el.querySelectorAll('details')).map((d) => d.open);
    const focused = el.contains(document.activeElement) ? document.activeElement : null;
    const focusKey = focused?.getAttribute('href') || focused?.id || '';
    const focusScroll = focused?.classList.contains('table-scroll');
    el.innerHTML = html;
    rendered.set(el, html);
    el.querySelectorAll('.table-scroll').forEach((s, i) => { s.scrollLeft = scrolls[i] || 0; });
    el.querySelectorAll('details').forEach((d, i) => { if (openDetails[i]) d.open = true; });
    if (focusScroll) el.querySelector('.table-scroll')?.focus({ preventScroll: true });
    if (focusKey) {
      const next = Array.from(el.querySelectorAll('a,button,[tabindex]')).find((e) => e.getAttribute('href') === focusKey || e.id === focusKey);
      next?.focus({ preventScroll: true });
    }
  }
  function notice(message = '', error = false) {
    const el = $('#connection-message');
    el.textContent = message;
    el.hidden = !message;
    el.className = `message${error ? ' error' : ''}`;
  }
  function status(message) {
    const el = $('#connection-state');
    if (el.textContent !== message) el.textContent = message;
  }
  function selectOptions(el, options, preferred) {
    if (!el) return;
    const chosen = options.some((o) => o.value === preferred) ? preferred : options[0]?.value || '';
    const html = options.map((o) => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('');
    if (el.innerHTML !== html) el.innerHTML = html;
    el.value = chosen;
    el.disabled = !options.length;
  }
  function renderPicker() {
    const options = entries().map((r) => ({ value: r.profile.id, label: `${pickerName(r)} · ${r.profile.id === ownId() ? 'your pioneer' : 'imported report'}` }));
    if (ownId() && !options.some((o) => o.value === ownId())) options.unshift({ value: ownId(), label: 'Your pioneer · awaiting first report' });
    if (!state.selected) state.selected = ownId() || options[0]?.value || '';
    if (state.selected && !options.some((o) => o.value === state.selected)) options.push({ value: state.selected, label: 'Requested profile · report unavailable' });
    selectOptions($('#selected-player'), options, state.selected);
    if (!options.length) {
      $('#selected-player').innerHTML = '<option>No camp reports yet</option>';
      $('#selected-player').disabled = true;
    }
    $$('[data-profile-link]').forEach((a) => { a.href = profileUrl(a.getAttribute('href').split('?')[0], state.selected); });
  }
  function metric(label, value) { return `<dl class="metric"><dt>${esc(label)}</dt><dd>${num(value)}</dd></dl>`; }
  function renderSummary() {
    const r = report();
    if (!r) {
      const own = !state.selected || state.selected === ownId();
      setHtml('[data-report-summary]', empty(own ? 'Your Homebase starts on Visitor' : 'This profile has no report', own ? 'Launch 10Six and enter a camp. Your claims and activity will appear here automatically.' : 'Select another pioneer or import a Visitor report for this profile.'));
      return;
    }
    const a = r.aggregate || {};
    setHtml('[data-report-summary]', `<div class="report-head"><div class="name">${esc(r.profile.display_name)}<span class="tag">${r.profile.id === ownId() ? 'YOUR PIONEER' : 'IMPORTED SNAPSHOT'}</span></div><p>${esc(faction(r.profile.corporation))} · Home camp ${r.profile.home_camp ? num(r.profile.home_camp) : 'unclaimed'} · Present camp ${r.profile.current_camp ? num(r.profile.current_camp) : 'unknown'}</p><p class="small muted">Report ${timeHtml(r.generated_unix)}${r.freshness?.stale ? ' · saved snapshot' : ''}</p></div><div class="metrics">${metric('OWNED CAMPS', a.owned_camps)}${metric('STORED TU', a.tu)}${metric('TU CAPACITY', a.capacity)}${metric('READY BUILDINGS', a.ready_buildings)}${metric('READY ROVERS', a.ready_rovers)}${metric('OBSERVED LOSSES', a.observed_losses)}</div>`);
  }
  function renderCamps() {
    const r = report();
    if (!r?.camps?.length) {
      setHtml('[data-camps]', empty('No camp report yet', 'Enter Visitor through the channel to record your first camp.'));
      return;
    }
    const rows = r.camps.map((c) => {
      const m = c.metrics || {};
      const local = c.owner_id === r.profile.id;
      const owner = c.owner_display_name || (local ? r.profile.display_name : 'Unclaimed');
      const snapshot = c.freshness === 'current_snapshot' ? 'Present camp' : c.freshness === 'stored_snapshot' ? 'Stored camp' : 'Undated camp';
      const last = c.last_raid;
      let raid = `${num(m.observed_losses)} observed`;
      if (last?.wave !== undefined) {
        const losses = Object.entries(last.losses || {}).map(([kind, count]) => `${esc(kind)}: ${num(count)}`).join('<br>');
        raid += `<details><summary>Raid ${num(last.wave)}</summary><p>${num(last.loss_count)} losses after this raid began.<br>${losses || 'No retained losses.'}</p></details>`;
      }
      return `<tr><th scope="row" class="camp-label">${esc(c.label || `Camp ${c.number}`)}<small>#${num(c.number)}${c.home ? ' · HOME' : ''}</small></th><td>${esc(owner)}<small class="muted">${c.corporation ? '<br>' + esc(faction(c.corporation)) : ''}</small></td><td class="number">${c.claimed_unix ? num(c.age_days) + ' days' : '—'}</td><td class="number">${num(m.tu)}<br><span class="muted">/ ${num(m.capacity)}</span></td><td class="number">${num(m.mined)}</td><td class="number">${num(m.ready_buildings)} / ${num(m.ready_rovers)} / ${num(m.ready_defenses)}</td><td>${raid}</td><td class="camp-state"><span class="tag ${c.current ? 'current' : 'stored'}">${esc(snapshot)}</span><br><small>${timeHtml(c.state_unix)}</small>${m.raid_active ? '<br><strong>Raid in progress</strong>' : ''}</td></tr>`;
    }).join('');
    setHtml('[data-camps]', `<div class="table-scroll" tabindex="0" role="region" aria-label="Camp claims, resources, losses and snapshot times"><table class="data camp-table"><caption>${num(r.aggregate?.visited_camps ?? r.camps.length)} visited camps. Losses cover retained activity, not a lifetime total. Scroll for all columns.</caption><thead><tr><th scope="col">Camp</th><th scope="col">Owner</th><th scope="col" class="number">Claim age</th><th scope="col" class="number">TU / capacity</th><th scope="col" class="number">Mined</th><th scope="col" class="number">Ready<br>Bldg / Rover / Defense</th><th scope="col">Raid losses</th><th scope="col">Camp snapshot</th></tr></thead><tbody>${rows}</tbody></table></div>`);
  }
  function activityText(event) {
    const d = event.details || {};
    switch (event.type) {
      case 'claimed': return ['CAMP CLAIMED', 'A new claim on Visitor.'];
      case 'raid': return ['RAID BEGAN', `Wave ${num(d.wave)} · ${num(d.raiders)} raiders.`];
      case 'repelled': return ['RAID REPELLED', `Wave ${num(d.wave)} defended.`];
      case 'lost': return ['ITEM LOST', `${d.kind || 'Item'}${d.durability !== undefined ? ' · durability ' + num(d.durability) : ''}.`];
      case 'absorbed': return ['ITEM DECAYED / ABSORBED', `${d.kind || 'Item'} was absorbed.`];
      case 'downed': return ['PIONEER DOWNED', `${num(d.cost)} TU recovery cost.`];
      case 'away': return ['CAMP CAUGHT UP', `${num(d.seconds)} seconds away · ${num(d.mined)} TU mined · ${num(d.spent)} TU spent.`];
      default: return null;
    }
  }
  function renderActivity() {
    const r = report();
    const events = (r?.activity || []).slice().reverse().map((event) => ({ event, text: activityText(event) })).filter((item) => item.text).slice(0, 30);
    if (!events.length) {
      setHtml('[data-activity]', empty('No retained activity', r ? 'New claims, raids, losses and camp returns will appear here as the game records them.' : 'Enter Visitor to begin your camp history.'));
      return;
    }
    setHtml('[data-activity]', `<ul class="activity-list">${events.map(({ event, text }) => `<li><span class="activity-kind">${esc(text[0])}</span> · Camp ${num(event.camp)}<br>${esc(text[1])}${timeHtml(event.unix)}</li>`).join('')}</ul><p class="small muted">Up to 30 recent events from the game’s retained camp logs.</p>`);
  }
  function renderDegrees() {
    const r = report();
    const d = r?.degrees || (state.selected === ownId() ? state.data?.degrees : null);
    const own = state.selected === ownId();
    if ((!own && (!d || d.balance === null || d.status === 'comparison_only'))) {
      setHtml('[data-degrees]', empty('Comparison profile', 'Imported camp reports do not carry a verified HEAT Degree balance. Importing a report earns no Degrees.'));
      setHtml('[data-transactions]', empty('No local statement', 'Degree statements are recorded for your locally launched pioneer.'));
      return;
    }
    const value = d?.balance ?? 0;
    const p = d?.progress || {};
    const seconds = d?.gameplay_seconds ?? p.active_seconds ?? 0;
    let progress = `<p class="small muted">${num(Math.floor(seconds / 60))} active minutes recorded. Full hours earn 250 Degrees; remaining minutes carry forward.</p>`;
    if (p.month_launch_days !== undefined) progress += `<p class="small">This month: <strong>${num(p.month_launch_days)} / ${num(p.days_in_month)} launch days</strong> · This year: <strong>${num(p.year_launch_days)} / ${num(p.days_in_year)}</strong></p>`;
    setHtml('[data-degrees]', `<div class="degree-balance"><span>YOUR CURRENT BALANCE</span><strong>${num(value)}</strong><span>HEAT DEGREES</span></div>${progress}${!r ? '<p class="small muted">Enter Visitor through HEAT.NET to begin recording attendance and play.</p>' : ''}`);
    const transactions = d?.transactions || d?.ledger || [];
    if (!transactions.length) {
      setHtml('[data-transactions]', empty('Your statement is ready', 'Recorded launch days, full gameplay hours and attendance bonuses will appear here.'));
      return;
    }
    setHtml('[data-transactions]', `<div class="table-scroll" tabindex="0" role="region" aria-label="Recorded Degree transactions"><table class="data"><thead><tr><th scope="col">When</th><th scope="col">Recorded earning</th><th scope="col" class="number">Degrees</th></tr></thead><tbody>${transactions.map((t) => `<tr><td>${timeHtml(t.unix)}</td><td>${esc(t.reason || t.description || 'Recorded play')}</td><td class="number">${Number(t.amount) > 0 ? '+' : ''}${num(t.amount)}</td></tr>`).join('')}</tbody></table></div>`);
  }
  function catalogItems() {
    const c = state.data?.catalog || {};
    return Array.isArray(c) ? c : [...(c.retired || []), ...(c.active || []), ...(c.visitor || []), ...(c.trophies || [])];
  }
  function renderTrophies() {
    const r = report();
    const catalog = catalogItems();
    const historical = state.data?.catalog?.historical || state.data?.catalog?.retired || [];
    setHtml('[data-historical-trophies]', `<ul class="trophy-list">${historical.map((item) => `<li>${item.verified && trophyArt.has(item.image) ? `<img src="../images/trophies/${esc(item.image)}" width="60" height="90" alt="${esc(item.name)}">` : ''}<div><strong>${esc(item.name)} <span class="tag">HISTORICAL</span></strong><p class="small">${esc(item.description)}</p>${trophyArt.has(item.image) ? '' : '<p class="small muted">Original artwork unavailable.</p>'}</div></li>`).join('')}</ul>`);
    const visitorIds = new Set((state.data?.catalog?.visitor || []).map((item) => item.id));
    const ownTrophies = state.selected === ownId() ? state.data?.trophies : null;
    const proposals = (r?.trophies?.proposals || ownTrophies?.proposals || state.data?.catalog?.proposals || []).filter((item) => !visitorIds.has(item.id));
    setHtml('[data-trophy-proposals]', `<ul class="trophy-list">${proposals.map((item) => `<li><div><strong>${esc(item.name)} <span class="tag">PROPOSED</span></strong><p class="small">${esc(item.description || '')}</p></div></li>`).join('')}</ul>`);
    const grants = r?.trophies?.granted || ownTrophies?.granted || r?.awards?.granted || [];
    if (!grants.length) {
      setHtml('[data-trophies]', empty('No trophies awarded', 'First Claim requires an owned camp with an online Nerve Center. Two-Camp Pioneer requires two such camps. Historical HEAT trophies keep their original event and community rules.'));
      return;
    }
    const rows = grants.map((grant) => {
      const id = typeof grant === 'string' ? grant : grant.id || grant.trophy_id;
      const item = catalog.find((c) => c.id === id);
      const visitor = item?.classification === 'EXPANSION' && visitorIds.has(id);
      const visitorImage = visitor && item?.verified === true && /^\/site\/images\/visitor-trophies\/(first-claim|two-camps)\.svg$/.test(item.image_url || '') ? item.image_url : '';
      const imageUrl = visitorImage || (item?.verified === true && trophyArt.has(item.image) ? `../images/trophies/${item.image}` : '');
      const image = imageUrl ? `<img src="${esc(imageUrl)}" width="60" height="90" alt="${esc(item.name)}">` : '';
      return `<li>${image}<div><strong>${esc(item?.name || grant.name || 'Recorded trophy')}${visitor ? ' <span class="tag current">NEW VISITOR AWARD</span>' : ''}</strong><p>${esc(grant.reason || '')}</p>${grant.unix ? '<p class="small muted">' + (visitor ? 'First verified locally: ' : 'Recorded: ') + esc(time(grant.unix)) + '</p>' : ''}</div></li>`;
    }).join('');
    const hasVisitorAwards = grants.some((grant) => visitorIds.has(typeof grant === 'string' ? grant : grant.id || grant.trophy_id));
    setHtml('[data-trophies]', `<ul class="trophy-list">${rows}</ul>${hasVisitorAwards ? '<p class="small muted">New awards for the local Visitor reconstruction. Dates record the first verification from a game report.</p>' : ''}`);
  }
  function renderEditor() {
    const form = $('#profile-form');
    if (!form) return;
    const own = state.selected === ownId();
    form.hidden = !own;
    const input = $('#display-name');
    if (own && document.activeElement !== input && !input.dataset.edited) input.value = report()?.profile.display_name || state.data?.identity?.display_name || state.identityName || '';
  }
  function renderPlayers() {
    if (page !== 'players') return;
    const query = $('#player-search').value.trim().toLowerCase();
    const sort = $('#player-sort').value;
    let players = entries().filter((r) => `${r.profile.display_name} ${faction(r.profile.corporation)}`.toLowerCase().includes(query));
    players = players.slice().sort((a, b) => sort === 'name' ? a.profile.display_name.localeCompare(b.profile.display_name) || a.profile.id.localeCompare(b.profile.id) : sort === 'recent' ? b.generated_unix - a.generated_unix : (b.aggregate?.[sort] || 0) - (a.aggregate?.[sort] || 0) || a.profile.display_name.localeCompare(b.profile.display_name));
    if (!players.length) {
      setHtml('[data-players]', empty(entries().length ? 'No pioneers match that search' : 'Your pioneer will be the first', entries().length ? 'Try a different name or corporation.' : 'Enter Visitor through HEAT.NET, then import another real local report to compare players.'));
    } else {
      setHtml('[data-players]', `<div class="table-scroll" tabindex="0" role="region" aria-label="Pioneer profiles and camp totals"><table class="data player-table"><caption>${num(players.length)} reported pioneers. Each report has its own local world; totals are snapshots, not global standings.</caption><thead><tr><th scope="col">Pioneer</th><th scope="col">Corporation</th><th scope="col" class="number">Camps</th><th scope="col" class="number">TU</th><th scope="col">Last report</th></tr></thead><tbody>${players.map((r) => `<tr><th scope="row"><a href="${profileUrl('myhomebase.html', r.profile.id)}">${esc(r.profile.display_name)}</a><br><span class="muted">${r.profile.id === ownId() ? 'Your pioneer' : 'Imported snapshot'}</span></th><td>${esc(faction(r.profile.corporation))}</td><td class="number">${num(r.aggregate?.owned_camps)}</td><td class="number">${num(r.aggregate?.tu)}</td><td>${timeHtml(r.generated_unix)}</td></tr>`).join('')}</tbody></table></div>`);
    }
    const options = entries().map((r) => ({ value: r.profile.id, label: pickerName(r) }));
    selectOptions($('#compare-a'), options, $('#compare-a').value || state.selected);
    const addedSecond = options.length > state.playersCount && $('#compare-b').value === $('#compare-a').value;
    selectOptions($('#compare-b'), options, (!addedSecond && $('#compare-b').value) || options.find((o) => o.value !== $('#compare-a').value)?.value);
    state.playersCount = options.length;
    const camps = entries().flatMap((r) => r.camps.map((c) => ({ value: `${r.profile.id}:${c.number}`, label: `${pickerName(r)} · ${c.label || 'Camp ' + c.number}` })));
    selectOptions($('#camp-a'), camps, $('#camp-a').value || camps.find((c) => c.value.startsWith(state.selected + ':'))?.value);
    selectOptions($('#camp-b'), camps, $('#camp-b').value || camps.find((c) => c.value !== $('#camp-a').value)?.value);
    renderComparisons();
  }
  function compareTable(aLabel, bLabel, values, caption) {
    return `<div class="table-scroll" tabindex="0" role="region" aria-label="${esc(caption)}"><table class="data"><caption>${esc(caption)}</caption><thead><tr><th scope="col">Measure</th><th scope="col">${esc(aLabel)}</th><th scope="col">${esc(bLabel)}</th></tr></thead><tbody>${values.map(([label, a, b, text]) => `<tr><th scope="row">${esc(label)}</th><td${text ? '' : ' class="number"'}>${text ? esc(a) : num(a)}</td><td${text ? '' : ' class="number"'}>${text ? esc(b) : num(b)}</td></tr>`).join('')}</tbody></table></div>`;
  }
  function renderComparisons() {
    if (page !== 'players') return;
    const a = entries().find((r) => r.profile.id === $('#compare-a').value);
    const b = entries().find((r) => r.profile.id === $('#compare-b').value);
    if (!a || !b || a === b) {
      setHtml('[data-player-comparison]', empty('Choose two different pioneers', entries().length < 2 ? 'Import another real Visitor report to unlock pioneer comparisons. You can compare your visited camps below.' : 'Choose a different second pioneer to compare their reported camp totals.'));
    } else {
      const aa = a.aggregate || {}, bb = b.aggregate || {};
      setHtml('[data-player-comparison]', compareTable(pickerName(a), pickerName(b), [
        ['Owned camps', aa.owned_camps, bb.owned_camps], ['Stored TU', aa.tu, bb.tu], ['TU capacity', aa.capacity, bb.capacity], ['Mined TU', aa.mined, bb.mined], ['Ready buildings', aa.ready_buildings, bb.ready_buildings], ['Ready rovers', aa.ready_rovers, bb.ready_rovers], ['Ready defenses', aa.ready_defenses, bb.ready_defenses], ['Raids repelled (retained)', aa.repelled, bb.repelled], ['Losses (retained)', aa.observed_losses, bb.observed_losses], ['Report saved', time(a.generated_unix), time(b.generated_unix), true]
      ], 'Independent local snapshots. Totals are not a shared-world ranking.'));
    }
    const all = entries().flatMap((r) => r.camps.map((c) => ({ key: `${r.profile.id}:${c.number}`, r, c })));
    const ca = all.find((c) => c.key === $('#camp-a').value), cb = all.find((c) => c.key === $('#camp-b').value);
    if (!ca || !cb || ca === cb) {
      setHtml('[data-camp-comparison]', empty('Choose two different camps', all.length < 2 ? 'Visit a second camp or import a report with another visited camp.' : 'Choose a different second camp to compare their snapshots.'));
      return;
    }
    const ma = ca.c.metrics || {}, mb = cb.c.metrics || {};
    setHtml('[data-camp-comparison]', compareTable(`${pickerName(ca.r)} · #${ca.c.number}`, `${pickerName(cb.r)} · #${cb.c.number}`, [
      ['Owner', ca.c.owner_display_name || 'Unclaimed', cb.c.owner_display_name || 'Unclaimed', true], ['Claim age (days)', ca.c.claimed_unix ? ca.c.age_days : null, cb.c.claimed_unix ? cb.c.age_days : null], ['Stored TU', ma.tu, mb.tu], ['TU capacity', ma.capacity, mb.capacity], ['Mined TU', ma.mined, mb.mined], ['Ready buildings', ma.ready_buildings, mb.ready_buildings], ['Ready rovers', ma.ready_rovers, mb.ready_rovers], ['Ready defenses', ma.ready_defenses, mb.ready_defenses], ['Losses (retained)', ma.observed_losses, mb.observed_losses], ['Snapshot saved', time(ca.c.state_unix), time(cb.c.state_unix), true]
    ], 'Camp snapshots keep their own recorded times. Stored camps catch up on return.'));
  }
  function renderLaunch() {
    const launch = state.data?.launch || {};
    $$('[data-launch]').forEach((button) => {
      button.disabled = state.launchBusy || !launch.available;
      button.title = launch.running ? 'Check the game: reopen it if closed, or keep the existing window.' : launch.available ? 'Open your local 10Six game.' : 'The local 10Six launcher is unavailable.';
    });
    $$('[data-launch-note]').forEach((el) => { el.textContent = launch.running ? '10Six is open in a separate game window. Choose CONTINUE SAVED PLOT or DEPLOY A NEW PLOT there to enter Visitor. Use Alt+Tab to switch to it.' : launch.available ? 'Opens your local Visitor game. Your report updates while you play.' : 'The local game launcher is unavailable. You can still browse imported reports.'; });
  }
  function renderDownload() {
    const r = report();
    $$('[data-download-report]').forEach((link) => {
      link.hidden = !r;
      if (!r) { link.removeAttribute('href'); link.removeAttribute('download'); return; }
      link.href = `/api/visitor/report?player=${encodeURIComponent(r.profile.id)}`;
      link.download = `visitor-${r.profile.id}.json`;
      link.textContent = `Download ${r.profile.display_name} report`;
      link.title = `Local Visitor snapshot recorded ${time(r.generated_unix)}`;
    });
  }
  function render() {
    renderPicker(); renderSummary(); renderCamps(); renderActivity(); renderDegrees(); renderTrophies(); renderEditor(); renderPlayers(); renderLaunch(); renderDownload();
  }
  async function request(url, body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(url, { method: body === undefined ? 'GET' : 'POST', cache: 'no-store', headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal, credentials: 'same-origin' });
      let data;
      try { data = await response.json(); } catch { throw new Error('The local server did not return a Visitor response.'); }
      if (!response.ok || data.ok === false) throw new Error(data.error?.message || data.error || data.message || `Local request failed (${response.status}).`);
      return data;
    } finally { clearTimeout(timer); }
  }
  async function refresh(manual = false) {
    if (state.busy) return;
    state.busy = true;
    $('#refresh-reports').disabled = true;
    if (manual) status('Refreshing…');
    try {
      const data = await request('/api/visitor');
      if (data.version !== 1 || !Array.isArray(data.profiles)) throw new Error('This Visitor report version is not supported.');
      state.data = data;
      state.lastSuccess = Date.now();
      render();
      status(data.profiles.length ? 'Reports connected' : 'Ready for Visitor');
      const errors = data.errors || [];
      notice(errors.length ? errors.map((e) => typeof e === 'string' ? e : e.message || e.error || 'A report could not be read.').join(' ') : '', !!errors.length);
    } catch (error) {
      status('Connection unavailable');
      notice(`${error.name === 'AbortError' ? 'The local connection timed out.' : error.message}${state.data ? ' Showing the last received reports.' : ' Start the local HEAT.NET preview and try Refresh.'}`, true);
      if (!state.data) {
        $$('[data-launch]').forEach((button) => { button.disabled = true; });
        ['[data-report-summary]', '[data-camps]', '[data-activity]', '[data-players]', '[data-degrees]', '[data-trophies]', '[data-transactions]'].forEach((selector) => setHtml(selector, empty('Waiting for the local connection', 'Use Refresh after the HEAT.NET preview is running.')));
        $$('[data-launch-note]').forEach((el) => { el.textContent = 'Reconnect to the local preview to check game availability.'; });
      }
    } finally { state.busy = false; $('#refresh-reports').disabled = false; }
  }
  function selectPlayer(id) {
    state.selected = id;
    const url = new URL(location.href);
    if (id) url.searchParams.set('player', id); else url.searchParams.delete('player');
    history.replaceState(null, '', url);
    render();
  }
  $('#selected-player').addEventListener('change', (event) => selectPlayer(event.target.value));
  $('#refresh-reports').addEventListener('click', () => refresh(true));
  $$('[data-launch]').forEach((button) => button.addEventListener('click', async () => {
    if (state.launchBusy) return;
    state.launchBusy = true; renderLaunch();
    try {
      const result = await request('/api/visitor/launch', { profile_id: ownId() });
      if (state.data) state.data.launch.running = true;
      status(result.message || '10Six is opening. Enter Visitor to begin your report.');
      notice((result.message || '10Six is opening. Your camp appears after you enter Visitor.') + ' Use Alt+Tab to switch to the game window.');
    } catch (error) { notice(error.message, true); }
    finally { state.launchBusy = false; renderLaunch(); }
  }));
  if (page === 'home') {
    $('#display-name').addEventListener('input', (event) => { event.target.dataset.edited = 'true'; });
    $('#profile-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = event.currentTarget.querySelector('button');
      const input = $('#display-name');
      if (!input.value.trim()) { $('#profile-status').textContent = 'Enter a display name.'; return; }
      button.disabled = true; $('#profile-status').textContent = 'Saving your name…';
      try {
        const saved = await request('/api/visitor/profile', { display_name: input.value.trim() });
        state.identityName = saved.display_name || saved.identity?.display_name || input.value.trim();
        delete input.dataset.edited;
        $('#profile-status').textContent = 'Your local profile name is saved.';
        await refresh();
      } catch (error) { $('#profile-status').textContent = error.message; }
      finally { button.disabled = false; }
    });
  }
  if (page === 'players') {
    $('#player-search').addEventListener('input', renderPlayers);
    $('#player-sort').addEventListener('change', renderPlayers);
    ['#compare-a', '#compare-b', '#camp-a', '#camp-b'].forEach((selector) => $(selector).addEventListener('change', renderComparisons));
    $('#import-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const file = $('#report-file').files[0];
      if (!file) return;
      const button = event.currentTarget.querySelector('button');
      button.disabled = true; $('#import-status').textContent = 'Checking the Visitor report…';
      try {
        if (file.size > 2 * 1024 * 1024) throw new Error('Choose a Visitor report smaller than 2 MB.');
        let incoming;
        try { incoming = JSON.parse(await file.text()); } catch { throw new Error('That file is not readable JSON. Choose a Visitor game report.'); }
        await request('/api/visitor/import', { report: incoming });
        state.selected = incoming.profile?.id || state.selected;
        $('#import-status').textContent = 'Report imported. This pioneer is ready for comparisons.';
        $('#report-file').value = '';
        await refresh();
        selectPlayer(state.selected);
      } catch (error) { $('#import-status').textContent = error.message; }
      finally { button.disabled = false; }
    });
  }
  window.addEventListener('popstate', () => { state.selected = new URLSearchParams(location.search).get('player') || ownId(); if (state.data) render(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  refresh();
  setInterval(() => { if (!document.hidden) refresh(); }, 5000);
})();

(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const labels = { online: 'Online', away: 'Away', offline: 'Offline', in_game: 'Playing 10SIX' };
  let data, self = '', peer = new URLSearchParams(location.search).get('player') || '', messages = [], more = false, threadBusy = false, revision = 0, read = 0, pending = null;
  const drafts = new Map();
  function notice(text, failed = false) { $('#messenger-notice').textContent = text; $('#messenger-notice').classList.toggle('error', failed); }
  async function api(action, payload) {
    const res = await fetch('/api/visitor/messenger/' + action, { method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const result = await res.json(); if (!res.ok) throw new Error(result.error || 'Messenger action failed.'); return result;
  }
  function drawDirectory() {
    if (!data) return;
    const query = $('#messenger-search').value.trim().toLowerCase(), group = $('#messenger-group').value;
    const players = data.players.filter(p => p.profile_id !== self && `${p.display_name} ${p.username}`.toLowerCase().includes(query) &&
      (!$('#messenger-online').checked || p.status !== 'offline') &&
      (group === 'all' || group === 'buddies' && p.buddy || group === 'inbox' && data.conversations.some(c => c.profile_id === p.profile_id)))
      .sort((a, b) => Number(b.status !== 'offline') - Number(a.status !== 'offline') || a.username.localeCompare(b.username));
    const focused = document.activeElement?.dataset.peer;
    $('#messenger-players').innerHTML = players.map(p => {
      const unread = data.conversations.find(c => c.profile_id === p.profile_id)?.unread || 0;
      return `<button type="button" class="messenger-player ${p.profile_id === peer ? 'selected' : ''}" data-peer="${esc(p.profile_id)}" aria-pressed="${p.profile_id === peer}"><span class="presence-dot ${esc(p.status)}" aria-hidden="true"></span><strong>${esc(p.display_name)}</strong><small>@${esc(p.username)}${p.event_persona ? ' · event recreation' : ''}</small><span>${labels[p.status]}${p.blocked ? ' · Blocked' : ''}${unread ? ` · ${unread} new` : ''}</span></button>`;
    }).join('') || '<p class="empty">No matching accounts.</p>';
    if (focused) $('#messenger-players').querySelector(`[data-peer="${focused}"]`)?.focus({ preventScroll: true });
    $('#messenger-unread').textContent = `${data.unread} unread`;
  }
  function drawPeer() {
    const p = data?.players.find(p => p.profile_id === peer);
    $('#messenger-conversation').hidden = !p; $('#messenger-empty').hidden = Boolean(p);
    if (!p) return;
    $('#messenger-peer').textContent = p.display_name;
    $('#messenger-peer-status').textContent = `@${p.username} · ${labels[p.status]}${p.event_persona ? ' · recreated event contact' : ''}`;
    $('#messenger-buddy').textContent = p.buddy ? 'Remove buddy' : 'Add buddy';
    $('#messenger-block').hidden = Boolean(p.event_persona); $('#messenger-block').textContent = p.blocked ? 'Unblock' : 'Block';
    $('#messenger-send').disabled = p.blocked || p.event_persona && p.status !== 'online';
    $('#messenger-delivery').textContent = p.blocked ? 'Unblock this account to send pages.' : p.event_persona
      ? data.event.won_by_you ? 'You won today’s 10,000 Degrees. See your Degree statement.' : data.event.claimed ? 'Today’s prize has been claimed.' : p.status === 'online' ? 'First page during this visit wins 10,000 Degrees.' : 'OZYMANDIAS is offline. Watch for a visit.'
      : p.status === 'offline' ? 'Offline pages are saved for their next sign-in.' : 'Pages arrive as the recipient’s messenger refreshes.';
  }
  function drawMessages() {
    const log = $('#messenger-log'), atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 45;
    const html = messages.map(m => `<article class="private-page ${m.from === self ? 'sent' : 'received'}"><div><strong>${m.from === self ? 'You' : esc(data.players.find(p => p.profile_id === m.from)?.display_name || 'Player')}</strong><time datetime="${new Date(m.unix * 1000).toISOString()}">${esc(new Date(m.unix * 1000).toLocaleString())}</time></div><p>${esc(m.text)}</p></article>`).join('') || '<p class="empty">No pages yet. Write the first one below.</p>';
    if (log.innerHTML !== html) { log.innerHTML = html; if (atBottom) log.scrollTop = log.scrollHeight; }
    $('#messenger-older').hidden = !more;
  }
  async function loadThread(older = false) {
    if (!self || !peer || threadBusy) return;
    threadBusy = true; const selected = peer, own = self, version = revision;
    try {
      const before = older && messages.length ? '&before=' + messages[0].id : '';
      const res = await fetch(`/api/visitor/messenger?player=${encodeURIComponent(selected)}${before}`, { cache: 'no-store', credentials: 'same-origin' });
      const result = await res.json(); if (!res.ok) throw new Error(result.error);
      if (peer !== selected || self !== own || version !== revision) return;
      if (!older && messages.length && result.messages.length && result.messages[0].id > messages.at(-1).id) { messages = []; more = result.more; }
      const map = new Map([...messages, ...result.messages].map(m => [m.id, m])); messages = [...map.values()].sort((a, b) => a.id - b.id);
      if (older || messages.length <= 100) more = result.more;
      drawMessages();
      const last = messages.findLast(m => m.to === self);
      if (!document.hidden && last && last.id > read) {
        await api('contact', { player: selected, action: 'read', through: last.id });
        if (version === revision) {
          read = last.id;
          const conversation = data.conversations.find(c => c.profile_id === selected);
          if (conversation) { data.unread = Math.max(0, data.unread - conversation.unread); conversation.unread = 0; drawDirectory(); }
          document.querySelectorAll('[data-messenger-link]').forEach(a => { a.textContent = 'HEAT Messenger' + (data.unread ? ` (${data.unread})` : ''); });
        }
      }
    } catch (error) { if (version === revision) notice(error.message, true); }
    finally { threadBusy = false; if (version !== revision) loadThread(); }
  }
  function choose(id) {
    if (peer) drafts.set(peer, $('#messenger-text').value);
    peer = id; revision++; messages = []; more = false; read = 0; pending = null;
    $('#messenger-text').value = drafts.get(peer) || ''; $('#messenger-count').textContent = `${$('#messenger-text').value.length}/2000`;
    history.replaceState(null, '', '?player=' + encodeURIComponent(peer)); drawDirectory(); drawPeer(); drawMessages(); loadThread();
  }
  function receive(next) {
    data = next;
    if (self !== data.self_id) {
      self = data.self_id; revision++; drafts.clear(); messages = []; more = false; read = 0; pending = null; $('#messenger-text').value = '';
      if (peer === self) peer = '';
      drawMessages();
    }
    $('#messenger-signin').hidden = true; $('#messenger-workspace').hidden = false;
    const mine = data.players.find(p => p.profile_id === self);
    $('#messenger-account').textContent = `${mine.display_name} (@${mine.username})`;
    $('#messenger-presence').value = window.heatMessenger.preference();
    $('#messenger-event').textContent = `OZYMANDIAS · ${labels[data.event.status]} · ${data.event.claimed ? data.event.won_by_you ? 'You won 10,000 Degrees today!' : 'Today’s prize claimed' : '10,000 Degrees for the first page'}`;
    $('#messenger-event-open').disabled = !data.event.can_open; $('#messenger-host').hidden = !data.event.can_open;
    $('#messenger-status').textContent = 'Connected'; $('#messenger-status').classList.remove('error');
    drawDirectory(); drawPeer(); loadThread();
  }
  window.addEventListener('heat-messenger', event => receive(event.detail));
  window.addEventListener('heat-messenger-error', event => {
    $('#messenger-status').textContent = event.detail.status === 401 ? 'Sign in required' : 'Reconnecting…';
    if (event.detail.status === 401) { self = ''; data = null; revision++; messages = []; drafts.clear(); pending = null; $('#messenger-log').replaceChildren(); $('#messenger-text').value = ''; $('#messenger-workspace').hidden = true; $('#messenger-signin').hidden = false; }
    else notice(event.detail.message, true);
  });
  $('#messenger-players').addEventListener('click', event => { const row = event.target.closest('[data-peer]'); if (row) choose(row.dataset.peer); });
  for (const selector of ['#messenger-search', '#messenger-group', '#messenger-online']) $(selector).addEventListener('input', drawDirectory);
  $('#messenger-presence').addEventListener('change', event => window.heatMessenger.setPresence(event.target.value));
  $('#messenger-refresh').addEventListener('click', () => window.heatMessenger.refresh());
  $('#messenger-older').addEventListener('click', () => loadThread(true));
  $('#messenger-text').addEventListener('input', () => { $('#messenger-count').textContent = `${$('#messenger-text').value.length}/2000`; });
  for (const [selector, action] of [['#messenger-buddy', 'buddy'], ['#messenger-block', 'block']]) $(selector).addEventListener('click', async () => {
    try { const p = data.players.find(p => p.profile_id === peer); await api('contact', { player: peer, action, enabled: !p[action === 'buddy' ? 'buddy' : 'blocked'] }); await window.heatMessenger.refresh(); }
    catch (error) { notice(error.message, true); }
  });
  $('#messenger-compose').addEventListener('submit', async event => {
    event.preventDefault(); const text = $('#messenger-text').value, to = peer, version = revision;
    if (!pending || pending.text !== text || pending.to !== to) pending = { to, text, request_id: crypto.randomUUID() };
    $('#messenger-send').disabled = true;
    try {
      const result = await api('send', pending);
      if (version === revision) { if ($('#messenger-text').value === text) $('#messenger-text').value = ''; drafts.delete(to); pending = null; $('#messenger-count').textContent = `${$('#messenger-text').value.length}/2000`; notice(result.duplicate ? 'Page already saved.' : 'Page saved.'); }
      await window.heatMessenger.refresh(); await loadThread();
    } catch (error) { notice(error.message, true); }
    finally { drawPeer(); }
  });
  $('#messenger-event-open').addEventListener('click', async () => {
    try { await api('event', {}); notice('OZYMANDIAS is online for five minutes. The first page wins.'); await window.heatMessenger.refresh(); choose('event-ozymandias'); }
    catch (error) { notice(error.message, true); }
  });
  $('#messenger-signout').addEventListener('click', async () => {
    try { const response = await fetch('/api/visitor/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); if (!response.ok) throw new Error('Sign out failed.'); location.href = 'myhomebase.html#account'; }
    catch (error) { notice(error.message, true); }
  });
  if (window.heatMessenger.data) receive(window.heatMessenger.data);
})();

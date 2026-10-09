/* Shared account presence and unread Pager badge across the restored portal. */
(() => {
  'use strict';
  let self = '', busy = false;
  const preference = () => { try { return localStorage.getItem('heat-presence:' + self) || 'online'; } catch { return 'online'; } };
  const actual = () => preference() === 'offline' ? 'offline' : preference() === 'away' || document.hidden ? 'away' : 'online';
  async function heartbeat() {
    if (!self) return;
    const response = await fetch('/api/visitor/messenger/presence', { method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: actual() }) });
    if (!response.ok) throw Object.assign(new Error('Presence could not be updated.'), { status: response.status });
  }
  async function refresh() {
    if (busy) return; busy = true;
    try {
      await heartbeat();
      const response = await fetch('/api/visitor/messenger', { cache: 'no-store', credentials: 'same-origin' });
      const data = await response.json();
      if (!response.ok) { if (response.status === 401) self = ''; throw Object.assign(new Error(data.error), { status: response.status }); }
      const changed = self !== data.self_id; self = data.self_id;
      if (changed) await heartbeat();
      window.heatMessenger.data = data;
      document.querySelectorAll('[data-messenger-link]').forEach(a => { a.textContent = 'HEAT Messenger' + (data.unread ? ` (${data.unread})` : ''); });
      window.dispatchEvent(new CustomEvent('heat-messenger', { detail: data }));
    } catch (error) {
      if (error.status === 401) self = '';
      if (!self) window.heatMessenger.data = null;
      document.querySelectorAll('[data-messenger-link]').forEach(a => { a.textContent = self ? 'Messenger · reconnecting' : 'HEAT Messenger · sign in'; });
      window.dispatchEvent(new CustomEvent('heat-messenger-error', { detail: { message: error.message, status: error.status || 0 } }));
    } finally { busy = false; }
  }
  window.heatMessenger = { data: null, refresh, preference,
    async setPresence(value) { try { localStorage.setItem('heat-presence:' + self, value); } catch {} await refresh(); } };
  const nav = document.querySelector('.channel-sidebar nav');
  if (nav) {
    const link = document.createElement('a'); link.href = '/site/pages/pager.html'; link.dataset.messengerLink = '';
    link.textContent = 'HEAT Messenger'; if (location.pathname.endsWith('/pager.html')) link.setAttribute('aria-current', 'page'); nav.append(link);
  }
  document.addEventListener('visibilitychange', refresh);
  window.addEventListener('storage', event => { if (event.key === 'heat-presence:' + self) refresh(); });
  document.querySelectorAll('a[href$="pager.html"]').forEach(a => { a.title = 'HEAT Messenger'; });
  refresh(); setInterval(refresh, 10000);
})();

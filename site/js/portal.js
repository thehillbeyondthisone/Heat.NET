/* Small read-only network summary for the HEAT front page. */
(() => {
  'use strict';
  const panel = document.querySelector('[data-portal-status]');
  if (!panel) return;

  const pick = (name) => panel.querySelector(`[data-portal-${name}]`);
  const set = (name, value) => {
    const node = pick(name);
    if (node) node.textContent = value;
  };
  const format = (value) => Number.isFinite(Number(value))
    ? Number(value).toLocaleString('en-US', { maximumFractionDigits: 1 })
    : '—';
  let busy = false;

  async function refresh() {
    if (busy) return;
    busy = true;
    const button = pick('refresh');
    if (button) button.disabled = true;
    try {
      const response = await fetch('/api/visitor', { cache: 'no-store', credentials: 'same-origin' });
      const data = await response.json();
      if (!response.ok || data.version !== 1) throw new Error('Visitor connection unavailable');
      const own = (data.profiles || []).find((report) => report.profile?.id === data.selected_profile_id);
      const degrees = own?.degrees || data.degrees;
      panel.dataset.state = 'connected';
      pick('dot')?.classList.add('connected');
      set('connection', own ? 'LOCAL VISITOR CONNECTED' : 'READY FOR FIRST REPORT');
      set('profile', own?.profile?.display_name || data.identity?.display_name || 'Pioneer');
      set('camps', format(own?.aggregate?.owned_camps ?? 0));
      set('degrees', format(degrees?.balance ?? 0));
      set('detail', data.launch?.running
        ? '10SIX is open in a separate game window.'
        : data.launch?.available
          ? 'The local 10SIX launcher is ready.'
          : 'Reports are available; the game launcher is not prepared.');
    } catch {
      panel.dataset.state = 'offline';
      pick('dot')?.classList.remove('connected');
      set('connection', 'LOCAL VISITOR OFFLINE');
      set('profile', '—');
      set('camps', '—');
      set('degrees', '—');
      set('detail', 'Start HEAT.NET with Connect HEAT.NET.cmd, then refresh this page.');
    } finally {
      busy = false;
      if (button) button.disabled = false;
    }
  }

  pick('refresh')?.addEventListener('click', refresh);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  refresh();
})();

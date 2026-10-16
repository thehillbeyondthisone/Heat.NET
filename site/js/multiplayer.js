(() => {
  'use strict';
  const button = document.querySelector('[data-shared-launch]'), status = document.querySelector('[data-shared-status]');
  if (!button) return;
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      const res = await fetch('/api/visitor/multiplayer/launch', { method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const data = await res.json(); if (!res.ok) throw new Error(data.error);
      status.textContent = data.message;
    } catch (error) { status.textContent = error.message; }
    finally { button.disabled = false; }
  });
  fetch('/api/visitor').then(res => res.json()).then(data => {
    button.disabled = !data.auth?.account || !data.multiplayer?.available || !data.auth.host_pc;
    status.textContent = button.disabled ? 'Sign in on this PC to enter shared Visitor.' : 'Opens a separate native window. Local plots and shared camps use separate state.';
  }).catch(() => { button.disabled = true; status.textContent = 'Reconnect to HEAT.NET to check the shared world.'; });
})();

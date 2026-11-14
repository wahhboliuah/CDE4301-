// Simple password screen for the report.
// Only a SHA-256 hash of the password is stored here, never the password itself.
// This deters casual visitors only: the repository is public, so its files can still be read on GitHub.
// To change the password, replace PASSWORD_HASH (see README, "Password screen").
(() => {
  'use strict';
  const PASSWORD_HASH = '1cd5fe93798c237609bbb0b4dd105930db3e23f903afd88838c7a2de99a54682';
  const KEY = 'report-unlocked';
  const root = document.documentElement;

  let remembered = false;
  try { remembered = sessionStorage.getItem(KEY) === PASSWORD_HASH; } catch { /* storage unavailable */ }
  if (remembered) { root.classList.remove('pw-locked'); return; }

  async function sha256(text) {
    const bytes = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function build() {
    const gate = document.createElement('div');
    gate.className = 'pw-gate';
    gate.innerHTML = `
      <form class="pw-card" novalidate>
        <p class="pw-eyebrow">CDE4301 · Final Year Project</p>
        <h1 class="pw-title">Optimisation of Suspension and Brakes System for FSAE</h1>
        <p class="pw-text">This report is password protected. Enter the password to continue.</p>
        <label class="pw-label" for="pw-input">Password</label>
        <div class="pw-row">
          <input id="pw-input" type="password" autocomplete="current-password" autocapitalize="characters" spellcheck="false" required>
          <button type="submit">Open report</button>
        </div>
        <p class="pw-error" role="alert" aria-live="assertive"></p>
      </form>`;
    document.body.prepend(gate);
    const form = gate.querySelector('form');
    const input = gate.querySelector('input');
    const error = gate.querySelector('.pw-error');
    input.focus();

    if (!window.crypto?.subtle) {
      error.textContent = 'This page must be opened over https to unlock it.';
      return;
    }
    form.addEventListener('submit', async event => {
      event.preventDefault();
      // Matric-style passwords are accepted in either case.
      const hash = await sha256(input.value.trim().toUpperCase());
      if (hash !== PASSWORD_HASH) {
        error.textContent = 'Incorrect password. Please try again.';
        input.select();
        return;
      }
      try { sessionStorage.setItem(KEY, PASSWORD_HASH); } catch { /* still unlock this view */ }
      gate.remove();
      root.classList.remove('pw-locked');
      document.getElementById('report-content')?.focus({ preventScroll: true });
    });
  }

  if (document.body) build();
  else document.addEventListener('DOMContentLoaded', build, { once: true });
})();

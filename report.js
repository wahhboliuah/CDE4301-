(() => {
  'use strict';
  const chapters = [...document.querySelectorAll('[data-chapter]')];
  const allowedPages = new Set(chapters.map(chapter => chapter.dataset.chapter));
  allowedPages.add('all');
  const sidebar = document.getElementById('sidebar');
  const menuButton = document.querySelector('.mobile-nav-toggle');
  const main = document.getElementById('report-content');
  const lightbox = document.querySelector('.figure-lightbox');
  let lastImage = null;

  function closeMenu() {
    sidebar.classList.remove('open');
    menuButton.setAttribute('aria-expanded', 'false');
  }

  function renderRoute(moveFocus = false) {
    const params = new URLSearchParams(location.search);
    let page = params.get('page') || 'section-1.html';
    let anchor = params.get('anchor') || '';
    if (!anchor && location.hash) {
      try { anchor = decodeURIComponent(location.hash.slice(1)); } catch { anchor = ''; }
    }
    const destination = anchor ? document.getElementById(anchor) : null;
    if (destination?.closest('[data-chapter]')) page = destination.closest('[data-chapter]').dataset.chapter;
    if (!allowedPages.has(page)) page = 'section-1.html';
    chapters.forEach(chapter => { chapter.hidden = page !== 'all' && chapter.dataset.chapter !== page; });
    document.querySelectorAll('.sidebar a[data-page]').forEach(link => {
      link.removeAttribute('aria-current');
      if (link.dataset.page === page && !link.dataset.anchor) link.setAttribute('aria-current', 'page');
      if (anchor && link.dataset.anchor === anchor) link.setAttribute('aria-current', 'location');
    });
    closeMenu();
    if (moveFocus) main.focus({ preventScroll: true });
    requestAnimationFrame(() => {
      if (destination && destination.closest('[data-chapter]')) destination.scrollIntoView({ block: 'start' });
      else window.scrollTo({ top: 0, behavior: 'instant' });
    });
  }

  document.addEventListener('click', event => {
    const link = event.target.closest('a[data-page]');
    if (!link || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const url = new URL(location.href);
    url.search = '';
    url.hash = '';
    url.searchParams.set('page', link.dataset.page);
    if (link.dataset.anchor) url.searchParams.set('anchor', link.dataset.anchor);
    history.pushState(null, '', url);
    renderRoute(true);
  });
  window.addEventListener('popstate', () => renderRoute(true));
  window.addEventListener('hashchange', () => renderRoute(true));
  menuButton.addEventListener('click', () => {
    const open = sidebar.classList.toggle('open');
    menuButton.setAttribute('aria-expanded', String(open));
  });
  document.querySelectorAll('.nav-toggle').forEach(button => {
    button.addEventListener('click', () => {
      const open = button.getAttribute('aria-expanded') !== 'true';
      button.setAttribute('aria-expanded', String(open));
      document.getElementById(button.getAttribute('aria-controls')).hidden = !open;
    });
  });
  document.querySelectorAll('.data-table').forEach(table => {
    const wrapper = document.createElement('div');
    wrapper.className = 'table-scroll';
    wrapper.tabIndex = 0;
    wrapper.setAttribute('role', 'region');
    wrapper.setAttribute('aria-label', 'Report table; scroll horizontally on small screens');
    table.before(wrapper);
    wrapper.appendChild(table);
  });

  function openFigure(img) {
    lastImage = img;
    const display = lightbox.querySelector('img');
    display.src = img.src;
    display.alt = img.alt;
    lightbox.querySelector('.lightbox-caption').textContent = img.closest('figure').querySelector('figcaption')?.textContent || img.alt;
    lightbox.showModal();
    document.body.classList.add('lightbox-open');
  }
  document.querySelectorAll('.report-figure img').forEach(img => {
    img.loading = 'eager';
    img.tabIndex = 0;
    img.setAttribute('role', 'button');
    img.setAttribute('aria-label', 'Enlarge: ' + img.alt);
    img.addEventListener('click', () => openFigure(img));
    img.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openFigure(img);
      }
    });
  });
  lightbox.querySelector('.lightbox-close').addEventListener('click', () => lightbox.close());
  lightbox.addEventListener('click', event => { if (event.target === lightbox) lightbox.close(); });
  lightbox.addEventListener('close', () => {
    document.body.classList.remove('lightbox-open');
    lightbox.querySelector('img').removeAttribute('src');
    lastImage?.focus({ preventScroll: true });
  });
  document.querySelector('.back-to-top').addEventListener('click', () => window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }));
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); });
  window.addEventListener('beforeprint', () => { if (lightbox.open) lightbox.close(); });
  document.getElementById('print-report').addEventListener('click', async () => {
    await Promise.all([...document.querySelectorAll('.report-figure img')].map(img => img.decode().catch(() => {})));
    window.print();
  });
  renderRoute();
})();

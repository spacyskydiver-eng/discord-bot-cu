/* The Arsenal, at #/Arsenal (or /arsenal): everything built for The Great War. For now everyone sees
   the Coming Soon screen. Staff who open the site with ?preview=1 get the real viewer instead: the
   server then puts its settings in the page data and serves its script, which is loaded only here. */
(window.CUE_EXT = window.CUE_EXT || []).push(({ B, icon, esc, $ }) => {
  const DISCORD = 'https://discord.gg/x832cqAdu';

  function comingSoon(view) {
    const C = window.CUE || {};
    view.innerHTML = `<div class="ars-soon">
      <picture class="ars-soon-bg" aria-hidden="true">
        <source type="image/webp" srcset="/media/arsenal/markv_wheat_720.webp 720w, /media/arsenal/markv_wheat_1280.webp 1280w, /media/arsenal/markv_wheat_1920.webp 1920w" sizes="100vw">
        <img src="/media/arsenal/markv_wheat_1280.webp" alt="" decoding="async">
      </picture>
      <div class="ars-soon-shade" aria-hidden="true"></div>
      <div class="ars-soon-copy">
        <button class="nv-back" data-go="${esc(B.V.home)}">${icon('arrow-left')} Home</button>
        <div class="nv-kicker">The Great War</div>
        <h1>The Arsenal</h1>
        <p class="nv-lede">Tanks, weapons and uniforms built for The Great War. First look coming soon.</p>
        <div class="tst-row"><a class="tst-btn tst-primary" href="${esc(C.discord || DISCORD)}" target="_blank" rel="noopener">${icon('external')} Get notified in our Discord</a></div>
      </div>
    </div>`;
    view.onclick = e => { const g = e.target.closest('[data-go]'); if (g) B.go(g.dataset.go); };
  }

  // the viewer's script, fetched once and only when a staff preview opens the page
  let loading = null;
  const loadViewer = src => loading || (loading = new Promise((ok, fail) => {
    if (window.CUE_ARSENAL_VIEWER) return ok();
    const s = document.createElement('script');
    s.src = src; s.onload = ok; s.onerror = () => { loading = null; fail(new Error('viewer did not load')); };
    document.head.appendChild(s);
  }));

  function show(view) {
    const A = (window.CUE || {}).arsenal;
    let cleanup = null, alive = true;
    if (!A || !A.preview) comingSoon(view);
    else {
      view.innerHTML = '<div class="nv-empty" style="padding:40px">Loading the Arsenal…</div>';
      loadViewer(A.viewer).then(() => { if (alive) cleanup = window.CUE_ARSENAL_VIEWER(view, { B, icon, esc, $, settings: A, vip: (window.CUE || {}).vip }); })
        .catch(() => { if (alive) comingSoon(view); });
    }
    return () => {
      alive = false;
      if (cleanup) cleanup();
      if (location.pathname === '/arsenal') history.replaceState(null, '', '/' + location.hash);
    };
  }
  B.registerView('Arsenal', { title: () => 'The Arsenal', icon: 'flame', cls: 'nv-view nv-view-arsenal', show: v => show(v) });
});

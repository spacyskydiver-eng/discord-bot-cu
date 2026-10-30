/* The Arsenal viewer, open to everyone. Served through /assets/arsenal-viewer.js (server/routes/pages.js) and
   loaded only when the Arsenal page opens (public/assets/arsenal.js).

   Everything comes from the render job's manifest.json (mi_work/arsenal/manifest.py): the hangar's four
   views (home, armoury, tanks, kills) with their seamless loops, the camera moves between them, and the
   assets, each with its title, category, VIP tier, description, area and files. Paths in the manifest are
   relative to it. New renders show up without code changes.

   The scene is three layers on one 16:9 frame:
     back    the hangar: an area's loop, or a camera move (move_<from>__<to>.mp4) on the way to another area.
             A move starts and ends on the two loops' frame 0, so each next video is loaded ahead and shown
             on its own first frame: no flash, no gap.
     middle  the item: a transparent still rendered from the same locked camera as its area (so it sits on the
             loop exactly), faded in when picked; kill animations are full-frame clips over the kills loop.
     front   a soft vignette and drifting dust, drawn here.
   all drawn at exactly the same size and position (no parallax, no extra scaling: the stills carry a soft shadow on
   the floor, so the still and the video must be resampled identically or the cobblestones shimmer), with the
   frame's edges fading into the page.

   Close-ups: a look whose manifest entry has closeup: { view, files } (a flag or emblem) is shown from that close-up
   view: the camera moves there (move_<area>__<view>.mp4, chained through other views when there's no direct move),
   the look is shown at that framing, and the camera moves back when another look is picked. Until a close-up and a
   way to reach it are in the manifest, the look stays at its area's framing. */
'use strict';
window.CUE_ARSENAL_VIEWER = function (view, { B, icon, esc, settings: S, vip }) {
  const $ = (s, r = view) => r.querySelector(s);
  const $$ = (s, r = view) => [...r.querySelectorAll(s)];
  const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let alive = true;
  const stops = [];
  const TIER = { vip: 'VIP', vip_plus: 'VIP+' };
  const KIND = { tank: 'Standard', tank_skin: 'Skins', tank_flag: 'Flags', tank_emblem: 'Emblems' };

  injectStyle();
  view.innerHTML = `<div class="arsv">
    <div class="arsv-stage" aria-hidden="true">
      <div class="arsv-layer arsv-back"><img class="arsv-poster" alt=""></div>
      <div class="arsv-layer arsv-mid"><img class="arsv-img" alt=""><img class="arsv-img" alt=""><video class="arsv-clip" muted playsinline loop preload="none"></video></div>
      <div class="arsv-layer arsv-front"><canvas class="arsv-dust"></canvas><div class="arsv-vignette"></div></div>
    </div>
    <aside class="arsv-left">
      <button class="nv-back" data-home>${icon('arrow-left')} Home</button>
      <div class="arsv-kicker">The Great War</div>
      <h1 class="arsv-h1">The Arsenal</h1>
      <div class="arsv-tabs" role="tablist"></div>
      <div class="arsv-list" role="listbox" aria-label="Items"></div>
    </aside>
    <aside class="arsv-right" aria-live="polite"></aside>
    <div class="arsv-bottom"><div class="arsv-swatches"></div></div>
    <div class="arsv-msg" hidden></div>
  </div>`;
  const stage = $('.arsv-stage'), back = $('.arsv-back'), mid = $('.arsv-mid');

  /* ---------------------------------------------------------------- the manifest */
  let M = null, base = null;
  const url = p => (p ? new URL(p, base).href : null);
  const thumbOf = a => url((a.files || {}).thumbnail_webp || (a.files || {}).thumbnail || (a.files || {}).poster || (a.files || {}).transparent || null);
  const swatchOf = a => url((a.files || {}).swatch) || thumbOf(a);   // a close-up of what the look changes, if published
  const tankTitle = t => { const s = M.assets.find(a => a.tank === t && a.category === 'tank'); return s ? s.title : (t || '').replace(/_/g, ' '); };

  // a tab's list: one entry per tank (or per item, for things that aren't tanks), each with its variants
  function entriesFor(tab) {
    const inTab = a => (!tab.categories || tab.categories.includes(a.category)) && (!tab.tiers || tab.tiers.includes(a.vip_tier));
    const groups = new Map();
    for (const a of M.assets) {
      if (!inTab(a)) continue;
      const k = a.tank || a.base || a.id;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(a);
    }
    return [...groups].map(([k, items]) => {
      // on the Tanks tab every tank brings all its looks; elsewhere only what's in the tab
      const variants = tab.key === 'tanks' && items[0].tank ? M.assets.filter(a => a.tank === items[0].tank) : items;
      variants.sort((x, y) => Object.keys(KIND).indexOf(x.category) - Object.keys(KIND).indexOf(y.category));
      const lead = items[0];
      const title = lead.tank ? (tab.key === 'tanks' ? lead.title : tankTitle(lead.tank)) : (items.length > 1 ? lead.title.split(':')[0] : lead.title);
      const sub = lead.tank ? ((S.tanks[lead.tank] || {}).nation || '') + (variants.length > 1 ? ` · ${variants.length} looks` : '')
        : lead.kind === 'instant' ? 'Instant' : lead.kind === 'slow' ? 'Slow' : (TIER[lead.vip_tier] || '');
      return { key: k, title, sub, lead, variants };
    });
  }

  /* ---------------------------------------------------------------- the hangar (back layer) */
  const pool = [0, 1, 2].map(() => {
    const v = document.createElement('video');
    Object.assign(v, { muted: true, playsInline: true, preload: 'auto' });
    v.setAttribute('muted', ''); v.setAttribute('playsinline', '');
    v.className = 'arsv-v';
    back.appendChild(v);
    return v;
  });
  let area = null, current = null, busy = false, wanted = null, onArrive = () => {};
  function setSrc(v, src, loop) {
    v.loop = loop;
    if (v.dataset.src !== src) { v.dataset.src = src; v.src = src; v.load(); }
  }
  // resolves once the video has put a real frame on screen (it's hidden until then): not mid-seek, where a
  // reused video would still be showing a stale frame from the last time it played
  const firstFrame = v => new Promise(res => {
    const check = () => (!v.seeking && v.readyState >= 2 ? res() : next());
    const next = () => (v.requestVideoFrameCallback ? v.requestVideoFrameCallback(check) : requestAnimationFrame(check));
    if (v.requestVideoFrameCallback) next();
    else v.addEventListener('playing', () => requestAnimationFrame(() => requestAnimationFrame(check)), { once: true });
  });
  const rewind = v => { try { if (v.currentTime !== 0) v.currentTime = 0; } catch (e) { /* not loaded yet */ } };
  const ended = v => new Promise(res => v.addEventListener('ended', res, { once: true }));
  const freeVideo = busyOnes => pool.find(v => !busyOnes.includes(v));
  function showOnly(v) {
    for (const x of pool) { x.classList.toggle('on', x === v); if (x !== v) x.pause(); }
    current = v;
  }
  async function start(v, src, loop) {
    setSrc(v, src, loop);
    rewind(v);
    const ff = firstFrame(v);
    await v.play().catch(() => {});
    await Promise.race([ff, new Promise(r => setTimeout(r, 4000))]);
  }
  // the moves from one view to another: direct if there is one, else the shortest chain of moves (each move ends on
  // the next one's first frame, since both are that view's loop frame 0)
  function route(from, to) {
    if (!from) return null;
    const seen = new Set([from]), q = [[from, []]];
    while (q.length) {
      const [v, path] = q.shift();
      for (const m of M.moves) {
        if (m.from !== v || seen.has(m.to) || !m.file) continue;
        if (m.to === to) return [...path, m];
        seen.add(m.to); q.push([m.to, [...path, m]]);
      }
    }
    return null;
  }
  async function goTo(to) {
    if (!alive || to === area) { if (to === area) onArrive(to); return; }
    if (busy) { wanted = to; return; }
    busy = true;
    mid.classList.remove('on');
    const from = area, loopSrc = url((M.views[to] || {}).loop);
    const path = route(from, to);
    if (path) {
      // each next video loads (at its start) while the one before it plays, and is shown on its own first frame
      const seq = path.map(m => [url(m.file), false]);
      if (loopSrc) seq.push([loopSrc, true]);
      let next = freeVideo([current]);
      setSrc(next, seq[0][0], seq[0][1]);
      for (let i = 0; i < seq.length; i++) {
        const v = next;
        await start(v, seq[i][0], seq[i][1]);
        showOnly(v);
        if (i + 1 < seq.length) { next = freeVideo([v]); setSrc(next, seq[i + 1][0], seq[i + 1][1]); next.pause(); rewind(next); }
        if (!seq[i][1]) await ended(v);
        if (!alive) return;
      }
    } else if (loopSrc) {
      const vl = freeVideo([current]);
      vl.classList.add('fade');
      await start(vl, loopSrc, true);
      showOnly(vl);
      setTimeout(() => vl.classList.remove('fade'), 700);
    }
    area = to; busy = false;
    if (wanted && wanted !== area) { const w = wanted; wanted = null; goTo(w); return; }
    wanted = null;
    onArrive(to);
  }
  const vis = () => {
    if (document.hidden) { pool.forEach(v => v.pause()); clip.pause(); }
    else { if (current && current.loop) current.play().catch(() => {}); if (mid.classList.contains('on') && clip.src) clip.play().catch(() => {}); }
  };
  document.addEventListener('visibilitychange', vis);
  stops.push(() => document.removeEventListener('visibilitychange', vis));

  /* ---------------------------------------------------------------- the item (middle layer) */
  const imgs = $$('.arsv-img', mid), clip = $('.arsv-clip', mid);
  // always the full 1920 still, the video's own size, so both are scaled to the screen in exactly the same way
  const setImage = (el, f) => { el.src = url((f.webp && f.webp['1920']) || f.transparent || f.full); };
  // where a look is shown, and which files: its close-up when the manifest has one we can reach, else its area
  function placeOf(a) {
    const c = a && a.closeup, v = c && c.view && M.views[c.view];
    if (v && v.loop && c.files && (c.files.transparent || c.files.full) && (area === c.view || route(area || a.area, c.view) || route(a.area, c.view)))
      return { view: c.view, files: c.files };
    return { view: a ? a.area : null, files: (a && a.files) || {} };
  }
  // a still starts loading the moment it's picked (while the camera is still moving), and once one is showing
  // the rest of that tank's looks load quietly, so swapping between them is instant
  const pre = new Map();
  function prefetch(a) {
    const f = a ? placeOf(a).files : {};
    if (!a || a.category === 'kill_animation' || !(f.transparent || f.full)) return Promise.resolve();
    const key = f.transparent || f.full;
    if (!pre.has(key)) { const im = new Image(); setImage(im, f); pre.set(key, im.decode().catch(() => {})); }
    return pre.get(key);
  }
  function prefetchAll(list) {
    const next = () => {
      const a = list.shift();
      if (!a || !alive) return;
      prefetch(a).then(() => (window.requestIdleCallback ? requestIdleCallback(next, { timeout: 800 }) : setTimeout(next, 50)));
    };
    next();
  }
  let shown = null, slot = 0;
  async function showItem(a) {
    if (!a || !alive) return;
    const f = placeOf(a).files;
    const video = a.category === 'kill_animation' ? url(f.full) : null;
    if (video) {
      imgs.forEach(i => i.classList.remove('on'));
      if (clip.dataset.src !== video) { clip.dataset.src = video; clip.src = video; clip.preload = 'auto'; clip.classList.remove('on'); }
      const ff = firstFrame(clip);
      await clip.play().catch(() => {});
      await ff;
      if (shown !== a) return;
      clip.classList.add('on');
    } else {
      clip.pause(); clip.classList.remove('on');
      const next = imgs[slot ^ 1];
      setImage(next, f);
      try { await next.decode(); } catch (e) { /* shown anyway */ }
      if (shown !== a) return;
      next.classList.add('on'); imgs[slot].classList.remove('on'); slot ^= 1;
    }
    mid.classList.add('on');
    if (entry && entry.variants.includes(a)) prefetchAll(entry.variants.filter(x => x !== a));
  }

  /* ---------------------------------------------------------------- the front layer: dust */
  const dust = $('.arsv-dust');
  (function dustLoop() {
    const ctx = dust.getContext('2d');
    const specks = Array.from({ length: reduced ? 14 : 38 }, () => ({ x: Math.random(), y: Math.random(), r: 0.5 + Math.random() * 1.4, vx: (Math.random() - .5) * .00012, vy: -.00004 - Math.random() * .00008, a: .12 + Math.random() * .3, p: Math.random() * 6.3 }));
    let raf = 0, last = performance.now();
    const fit = () => { const r = stage.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1); dust.width = r.width * d; dust.height = r.height * d; };
    fit(); window.addEventListener('resize', fit); stops.push(() => window.removeEventListener('resize', fit));
    const draw = t => {
      if (!alive) return;
      const dt = Math.min(64, t - last); last = t;
      ctx.clearRect(0, 0, dust.width, dust.height);
      for (const s of specks) {
        if (!reduced) { s.x += s.vx * dt; s.y += s.vy * dt; s.p += dt * .0012; }
        if (s.y < -.02) { s.y = 1.02; s.x = Math.random(); }
        if (s.x < -.02) s.x = 1.02; if (s.x > 1.02) s.x = -.02;
        ctx.globalAlpha = s.a * (.6 + .4 * Math.sin(s.p));
        ctx.fillStyle = '#FFE6BE';
        ctx.beginPath(); ctx.arc(s.x * dust.width, s.y * dust.height, s.r * (dust.width / 1400), 0, 6.283); ctx.fill();
      }
      raf = document.hidden ? 0 : requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    const wake = () => { if (!document.hidden && !raf && alive) { last = performance.now(); raf = requestAnimationFrame(draw); } };
    document.addEventListener('visibilitychange', wake);
    stops.push(() => { cancelAnimationFrame(raf); document.removeEventListener('visibilitychange', wake); });
  })();

  /* ---------------------------------------------------------------- panels */
  let tabs = [], tab = null, entries = [], entry = null, item = null;
  const tierBadge = t => t ? `<span class="arsv-tier arsv-tier-${t}">${TIER[t]}</span>` : '';
  const owns = t => { const v = vip && vip.tier; return v === t || (v === 'vip_plus' && t === 'vip'); };

  function drawTabs() {
    $('.arsv-tabs').innerHTML = tabs.map(t => `<button role="tab" aria-selected="${t === tab}" class="arsv-tab${t === tab ? ' on' : ''}" data-tab="${t.key}">${esc(t.label)}</button>`).join('');
  }
  function drawList() {
    $('.arsv-list').innerHTML = entries.map((e, i) => {
      const th = thumbOf(e.lead);
      return `<button role="option" aria-selected="${e === entry}" class="arsv-item${e === entry ? ' on' : ''}" data-entry="${i}">
        <span class="arsv-thumb">${th ? `<img src="${esc(th)}" alt="" loading="lazy" decoding="async">` : icon(e.lead.category === 'kill_animation' ? 'play' : 'image')}</span>
        <span class="arsv-item-t"><b>${esc(e.title)}</b><small>${esc(e.sub)}</small></span></button>`;
    }).join('');
  }
  function drawSwatches() {
    const box = $('.arsv-swatches');
    if (!entry || entry.variants.length < 2) { box.innerHTML = ''; box.hidden = true; return; }
    box.hidden = false;
    const groups = [];
    for (const a of entry.variants) {
      const g = KIND[a.category] || 'Variants';
      let G = groups.find(x => x.g === g); if (!G) groups.push(G = { g, items: [] });
      G.items.push(a);
    }
    box.innerHTML = groups.map(G => `<div class="arsv-sw-group"><span class="arsv-sw-k">${esc(G.g)}</span><div class="arsv-sw-row">${G.items.map(a => {
      const th = swatchOf(a), i = entry.variants.indexOf(a);
      return `<button class="arsv-sw${a === item ? ' on' : ''}" data-variant="${i}" title="${esc(a.title)}" aria-label="${esc(a.title)}" aria-pressed="${a === item}">${th ? `<img src="${esc(th)}" alt="" decoding="async">` : ''}${a.vip_tier ? `<i class="arsv-sw-tier arsv-tier-${a.vip_tier}">${TIER[a.vip_tier]}</i>` : ''}</button>`;
    }).join('')}</div></div>`).join('');
  }
  function drawInfo() {
    const a = item, box = $('.arsv-right');
    if (!a) { box.innerHTML = ''; return; }
    const T = a.tank ? S.tanks[a.tank] || {} : {};
    const stats = T.stats ? S.stats.map(s => {
      const max = Math.max(...Object.values(S.tanks).map(t => (t.stats || {})[s.key] || 0)) || 1, v = T.stats[s.key];
      return v == null ? '' : `<div class="arsv-stat"><span>${esc(s.label)}</span><b>${esc(String(v))}${s.unit ? ' ' + esc(s.unit) : ''}</b><i><em style="width:${Math.round(v / max * 100)}%"></em></i></div>`;
    }).join('') : '';
    const t = a.vip_tier;
    const cta = !t ? '' : owns(t) ? `<span class="arsv-owned">${icon('check')} You own ${TIER[t]}</span>`
      : `<a class="arsv-buy" href="${esc(S.store[t])}" target="_blank" rel="noopener" data-tebex>${icon('cart')} Get ${TIER[t]}</a>`;
    box.innerHTML = `<div class="arsv-info">
      ${t ? tierBadge(t) : '<span class="arsv-tier arsv-tier-free">Everyone</span>'}
      <h2>${esc(a.title)}</h2>
      ${T.nation ? `<div class="arsv-nation">${esc(T.nation)}</div>` : ''}
      ${a.description ? `<p class="arsv-desc">${esc(a.description)}</p>` : ''}
      ${T.history ? `<p class="arsv-history">${esc(T.history)}</p>` : ''}
      ${stats ? `<div class="arsv-stats">${stats}<small>Historical figures</small></div>` : ''}
      ${cta}
    </div>`;
  }

  function pickTab(t) {
    tab = t; entries = entriesFor(t); drawTabs();
    pickEntry(entries[0]);
  }
  function pickEntry(e) {
    entry = e; drawList();
    pickItem(e ? e.lead : null);
  }
  function pickItem(a) {
    item = a; shown = a; drawSwatches(); drawInfo();
    if (!a) return;
    prefetch(a);
    const where = placeOf(a).view;
    if (area === where && !busy) { showItem(a); return; }
    onArrive = to => { if (shown && placeOf(shown).view === to) showItem(shown); };
    goTo(where);
  }

  view.addEventListener('click', e => {
    if (e.target.closest('[data-home]')) { B.go(B.V.home); return; }
    const tb = e.target.closest('[data-tab]'); if (tb) { pickTab(tabs.find(t => t.key === tb.dataset.tab)); return; }
    const en = e.target.closest('[data-entry]'); if (en) { pickEntry(entries[+en.dataset.entry]); return; }
    const sw = e.target.closest('[data-variant]'); if (sw) { pickItem(entry.variants[+sw.dataset.variant]); return; }
    const buy = e.target.closest('a[data-tebex]');
    if (buy) {
      // the Tebex checkout in its own small window, as on the store page
      e.preventDefault();
      const w = 480, h = 700;
      const win = window.open(buy.href, 'tebex', `width=${w},height=${h},left=${Math.round(screen.width / 2 - w / 2)},top=${Math.round(screen.height / 2 - h / 2)},scrollbars=yes,resizable=yes`);
      if (!win) window.open(buy.href, '_blank', 'noopener');
    }
  });

  /* ---------------------------------------------------------------- start */
  (async () => {
    try {
      const mUrl = new URL(S.manifest, location.href);
      base = new URL('.', mUrl);
      const r = await fetch(mUrl, { cache: 'no-cache' });
      if (!r.ok) throw new Error('manifest ' + r.status);
      M = await r.json();
      M.views = M.views || {}; M.moves = M.moves || []; M.assets = M.assets || [];
    } catch (e) {
      const m = $('.arsv-msg'); m.hidden = false; m.textContent = "The Arsenal's content couldn't be loaded (" + e.message + ').';
      return;
    }
    if (!alive) return;
    tabs = S.tabs.filter(t => !t.hidden && entriesFor(t).length);
    // open on the wide shot, then fly to the first tab's area
    const home = url((M.views.home || {}).loop), poster = url((M.views.home || {}).poster);
    if (poster) $('.arsv-poster').src = poster;           // the first frame straight away, while the loop loads
    if (home) { await start(pool[0], home, true); showOnly(pool[0]); area = 'home'; }
    if (!alive) return;
    if (tabs.length) pickTab(tabs[0]);
  })();

  return () => {
    alive = false;
    stops.forEach(f => f());
    pool.forEach(v => { v.pause(); v.removeAttribute('src'); v.load(); });
    clip.pause(); clip.removeAttribute('src');
  };

  function injectStyle() {
    if (document.getElementById('arsv-style')) return;
    const st = document.createElement('style');
    st.id = 'arsv-style';
    st.textContent = `
body.ui-nova .nv-view-arsenal { overflow: hidden auto; }
.arsv { position: relative; min-height: 100%; height: 100%; overflow: hidden; --gold: #FBBF24; --vipp: #C084FC; color: var(--text-normal); }
.arsv-stage { position: absolute; inset: 0; overflow: hidden;
  -webkit-mask-image: linear-gradient(90deg, transparent 0, #000 9%, #000 91%, transparent 100%), linear-gradient(180deg, transparent 0, #000 9%, #000 86%, transparent 100%);
  -webkit-mask-composite: source-in; mask-image: linear-gradient(90deg, transparent 0, #000 9%, #000 91%, transparent 100%), linear-gradient(180deg, transparent 0, #000 9%, #000 86%, transparent 100%); mask-composite: intersect; }
.arsv-layer { position: absolute; inset: 0; }
.arsv-poster { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.arsv-v, .arsv-img, .arsv-clip { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0; }
.arsv-v.on { opacity: 1; } .arsv-v.fade { transition: opacity .6s ease; }
.arsv-mid { opacity: 0; transition: opacity .18s ease; } .arsv-mid.on { opacity: 1; transition: opacity .35s ease; }
.arsv-img, .arsv-clip { transition: opacity .22s ease; } .arsv-img.on, .arsv-clip.on { opacity: 1; }
.arsv-dust { position: absolute; inset: 0; width: 100%; height: 100%; mix-blend-mode: screen; }
.arsv-vignette { position: absolute; inset: 0; background: radial-gradient(ellipse 70% 65% at 50% 48%, rgba(0,0,0,0) 50%, rgba(3,3,6,.55) 85%, rgba(3,3,6,.9) 100%); }
.arsv-left, .arsv-right { position: absolute; top: 0; bottom: 0; z-index: 2; padding: 26px 24px 120px; overflow-y: auto; scrollbar-width: thin; }
.arsv-left { left: 0; width: 300px; background: linear-gradient(90deg, rgba(3,3,6,.92) 0%, rgba(3,3,6,.72) 70%, rgba(3,3,6,0) 100%); padding-right: 44px; }
.arsv-right { right: 0; width: 340px; background: linear-gradient(270deg, rgba(3,3,6,.92) 0%, rgba(3,3,6,.72) 70%, rgba(3,3,6,0) 100%); padding-left: 48px; display: flex; flex-direction: column; justify-content: center; }
.arsv-kicker { margin-top: 16px; font-size: 11.5px; letter-spacing: .14em; text-transform: uppercase; color: var(--gold); font-weight: 700; }
.arsv-h1 { margin: 4px 0 16px; font-size: 30px; letter-spacing: -.02em; }
.arsv-tabs { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 14px; }
.arsv-tab { padding: 7px 13px; border-radius: 999px; border: 1px solid var(--background-modifier-border); background: rgba(255,255,255,.03); color: var(--text-muted); font: inherit; font-size: 13.5px; font-weight: 650; cursor: pointer; }
.arsv-tab.on { color: #111; background: var(--gold); border-color: var(--gold); }
.arsv-list { display: grid; gap: 6px; }
.arsv-item { display: flex; align-items: center; gap: 12px; width: 100%; padding: 7px 10px 7px 7px; border-radius: 12px; border: 1px solid transparent; background: rgba(255,255,255,.025); color: inherit; font: inherit; text-align: left; cursor: pointer; }
.arsv-item:hover { border-color: var(--background-modifier-border); }
.arsv-item.on { border-color: color-mix(in srgb, var(--gold) 60%, transparent); background: rgba(251,191,36,.08); }
.arsv-thumb { flex: none; width: 64px; height: 40px; border-radius: 8px; overflow: hidden; display: grid; place-items: center; background: rgba(255,255,255,.05); color: var(--text-muted); }
.arsv-thumb img { width: 100%; height: 100%; object-fit: cover; }
.arsv-thumb .svg-icon { width: 16px; height: 16px; }
.arsv-item-t { flex: 1; min-width: 0; display: grid; }
.arsv-item-t b { font-size: 14.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.arsv-item-t small { color: var(--text-muted); font-size: 12.5px; }
.arsv-tier { display: inline-block; padding: 2px 9px; border-radius: 999px; font-size: 11.5px; font-weight: 800; letter-spacing: .06em; }
.arsv-tier-vip { color: #111; background: var(--gold); }
.arsv-tier-vip_plus { color: #111; background: linear-gradient(90deg, var(--vipp), #F0ABFC); }
.arsv-tier-free { color: var(--text-muted); border: 1px solid var(--background-modifier-border); }
.arsv-info h2 { margin: 10px 0 4px; font-size: 26px; letter-spacing: -.01em; line-height: 1.15; }
.arsv-nation { color: var(--gold); font-weight: 650; font-size: 14px; margin-bottom: 10px; }
.arsv-desc { margin: 0 0 8px; color: var(--text-normal); line-height: 1.5; font-size: 14.5px; }
.arsv-history { margin: 0 0 16px; color: var(--text-muted); line-height: 1.5; font-size: 13.5px; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.arsv-stats { display: grid; gap: 9px; margin: 0 0 20px; }
.arsv-stats small { color: var(--text-muted); font-size: 11.5px; }
.arsv-stat { display: grid; grid-template-columns: 1fr auto; gap: 4px 10px; font-size: 13px; }
.arsv-stat span { color: var(--text-muted); } .arsv-stat b { font-weight: 650; }
.arsv-stat i { grid-column: 1 / -1; height: 4px; border-radius: 4px; background: rgba(255,255,255,.08); overflow: hidden; }
.arsv-stat em { display: block; height: 100%; background: linear-gradient(90deg, #B45309, var(--gold)); border-radius: 4px; }
.arsv-buy, .arsv-owned { display: inline-flex; align-items: center; gap: 8px; padding: 11px 18px; border-radius: 11px; font-weight: 700; font-size: 15px; text-decoration: none; }
.arsv-buy { color: #111; background: var(--gold); } .arsv-buy:hover { filter: brightness(1.08); }
.arsv-owned { color: var(--text-muted); border: 1px solid var(--background-modifier-border); }
.arsv-buy .svg-icon, .arsv-owned .svg-icon { width: 16px; height: 16px; }
.arsv-bottom { position: absolute; left: 300px; right: 340px; bottom: 92px; z-index: 2; display: flex; justify-content: center; pointer-events: none; }
.arsv-swatches { display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; padding: 6px 10px; border-radius: 12px; background: rgba(3,3,6,.62); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); pointer-events: auto; max-width: 100%; }
.arsv-sw-group { display: grid; gap: 3px; }
.arsv-sw-k { font-size: 9px; letter-spacing: .1em; text-transform: uppercase; color: var(--text-muted); font-weight: 700; }
.arsv-sw-row { display: flex; gap: 4px; flex-wrap: wrap; }
.arsv-sw { position: relative; width: 34px; height: 34px; padding: 0; border-radius: 8px; overflow: hidden; border: 2px solid rgba(255,255,255,.12); background: rgba(255,255,255,.05); cursor: pointer; }
.arsv-sw img { width: 100%; height: 100%; object-fit: cover; }
.arsv-sw.on { border-color: var(--gold); box-shadow: 0 0 0 2px rgba(251,191,36,.25); }
.arsv-sw-tier { position: absolute; right: 1px; bottom: 1px; padding: 0 2px; border-radius: 3px; font-style: normal; font-size: 7px; font-weight: 800; }
/* laptops: the stage is short, so the picker gets smaller still */
@media (min-width: 1001px) and (max-height: 860px) {
  .arsv-bottom { bottom: 84px; }
  .arsv-swatches { gap: 10px; padding: 5px 8px; }
  .arsv-sw { width: 28px; height: 28px; border-radius: 7px; }
  .arsv-sw-k { font-size: 8.5px; }
}
.arsv-msg { position: absolute; inset: auto 0 45% 0; text-align: center; color: var(--text-muted); z-index: 3; }
.arsv button:focus-visible, .arsv a:focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; }
@media (max-width: 1000px) {
  .arsv { height: auto; overflow: visible; }
  .arsv-stage { position: relative; inset: auto; aspect-ratio: 16 / 9; width: 100%; }
  .arsv-left, .arsv-right, .arsv-bottom { position: static; width: auto; background: none; padding: 14px 16px; overflow: visible; }
  .arsv-left { order: -1; padding-bottom: 0; }
  .arsv { display: flex; flex-direction: column; }
  .arsv-left .nv-back, .arsv-kicker { display: none; }
  .arsv-h1 { font-size: 24px; margin: 0 0 10px; }
  .arsv-list { display: flex; overflow-x: auto; gap: 8px; padding-bottom: 6px; }
  .arsv-item { flex: none; width: 220px; }
  .arsv-bottom { order: 1; padding-top: 0; } .arsv-swatches { background: none; padding: 0; justify-content: flex-start; }
  .arsv-right { order: 2; padding-bottom: 120px; }
}`;
    document.head.appendChild(st);
  }
};

/* Nova layout (CUE): the study site's Nova layout with the CUE home, navigator and pages.
   Originally: the second interface re-lays the vault out around modules and lectures instead of
   folders and files. Loaded after nova-components.js, only in Nova mode.
     - navigator: the left pane lists modules > lectures (plus practicals, seminars, extras) and tools
     - home: a LaserFlow hero landing on a "today" panel, an accordion of modules, a tool bento
     - module: a module page with a dithered cover and every lecture as a card with reading progress
     - reader: a lecture (or practical / seminar) read as one page, every topic note stitched in as a
       chapter, with a chapter rail, scroll progress, key terms used, and previous / next lecture
   app.js asks NovaUI.route(id) for a view before falling back to the normal note view, so Classic is
   untouched and the notes themselves are not changed. */
(() => {
'use strict';
const B = window.BV;
const { icon, esc, $, $$, h, store } = B;
const N = window.NovaUI;

const COLORS = { 'The Great War': '#FBBF24' };
const colorOf = s => COLORS[s] || '#8B5CF6';
// page changes from a click open out of the clicked element (nova-bits.js N.go)
const goFrom = el => (el.dataset.heading ? B.go(el.dataset.go, el.dataset.heading) : N.go ? N.go(el.dataset.go) : B.go(el.dataset.go));
const KIND = { lecture: 'Sections', practical: 'Practicals', seminar: 'Seminars', extra: 'Extras' };
const KIND_ONE = { lecture: 'Section', practical: 'Practical', seminar: 'Seminar', extra: 'Extra' };

/* ---------------------------------------------------------------- model */
let M = null;
const folderOf = id => id.slice(0, id.lastIndexOf('/'));
const nameOf = id => id.slice(id.lastIndexOf('/') + 1);
function model() {
  if (M && M.V === B.V) return M;
  const notes = B.V.notes;
  const modules = [], byTitle = {}, hubs = {}, folderHub = {}, folderTopics = {};
  for (const [id, n] of Object.entries(notes)) {
    const p = n.props || {};
    if (p.type === 'subject hub') {
      const m = { id, title: p.title || n.title, base: folderOf(id) + '/', semester: p.semester || '', color: colorOf(p.title || n.title), groups: {} };
      modules.push(m); byTitle[m.title] = m;
    } else if (p.type === 'hub') {
      hubs[id] = { id, title: p.title || n.title, kind: p.kind || 'extra', number: p.number || 0, subject: p.subject || '' };
      folderHub[folderOf(id)] = id;
    }
  }
  for (const [id, n] of Object.entries(notes)) {
    const p = n.props || {};
    if (p.type === 'topic' && folderHub[folderOf(id)]) (folderTopics[folderOf(id)] = folderTopics[folderOf(id)] || []).push(id);
  }
  for (const f in folderTopics) folderTopics[f].sort((a, b) => B.collator.compare(nameOf(a), nameOf(b)));
  for (const hub of Object.values(hubs)) {
    const m = byTitle[hub.subject] || modules.find(x => hub.id.startsWith(x.base));
    if (!m) continue;
    hub.module = m;
    hub.topics = folderTopics[folderOf(hub.id)] || [];
    (m.groups[hub.kind] = m.groups[hub.kind] || []).push(hub);
  }
  for (const m of modules) for (const k in m.groups) m.groups[k].sort((a, b) => (a.number - b.number) || B.collator.compare(nameOf(folderOf(a.id)), nameOf(folderOf(b.id))));
  const order = ['Molecular Biology and Genetics', 'Introduction to Biomedicine', 'Biological Chemistry', 'Cell Biology and Physiology', 'Professional Skills for Biosciences'];
  modules.sort((a, b) => ((order.indexOf(a.title) + 99) % 99) - ((order.indexOf(b.title) + 99) % 99) || B.collator.compare(a.title, b.title));
  const topicHub = {};
  for (const hub of Object.values(hubs)) for (const t of hub.topics || []) topicHub[t] = hub.id;
  M = { V: B.V, modules, byTitle, hubs, topicHub };
  return M;
}
const moduleOfId = id => model().modules.find(m => id.startsWith(m.base));
const plainNum = n => String(n).padStart(2, '0');

/* reading progress: furthest chapter reached per hub */
const READ_KEY = 'novaRead';
const readOf = id => (store.get(READ_KEY, {})[id] || 0);

/* ---------------------------------------------------------------- GL helpers: mount once the bundle is in */
function mountGL(el, kind, props, bag) {
  N.loadGL().then(() => {
    if (!el.isConnected || !B.isNova() || !N[kind]) return;
    try { bag.push(N[kind](el, props)); } catch (e) { console.error(e); }
  }).catch(() => {});
}
const destroyAll = bag => () => { while (bag.length) { try { bag.pop().destroy(); } catch (e) { /* already gone */ } } };

/* ---------------------------------------------------------------- navigator (left pane) */
const OPEN_KEY = 'novaNavOpen';
const CUE = () => window.CUE || {};
const wikiId = () => 'wiki';
const PAGES = () => [
  { id: wikiId(), label: 'The Great War', color: '#FBBF24', ic: 'book-open', tagline: 'The event wiki: setting, nations, warfare and rules.', meta: () => { const m = model().modules[0]; return m ? (m.groups.lecture || []).length + ' sections' : ''; } },
  { id: 'applications', label: 'Applications', color: '#34D399', ic: 'clipboard-list', tagline: 'Apply for upcoming CUE events.', meta: () => { const n = (CUE().applications || []).length; return n ? n + ' open' : 'Opening soon'; } },
  { id: 'events', label: 'Upcoming events', color: '#A78BFA', ic: 'calendar', tagline: 'What is next on the CUE calendar.', meta: () => (CUE().events || []).length + ' upcoming' },
  { id: 'store', label: 'Store', color: '#38BDF8', ic: 'cart', tagline: 'Cosmetic ranks that carry across every CUE event.', meta: () => (CUE().store || []).length + ' ranks' },
  { id: 'team', label: 'The Team', color: '#FB7185', ic: 'users', tagline: 'The people building Collective Union Events.', meta: () => (CUE().team || []).length + ' roles' },
].filter(p => p.id);
function navPane(root) {
  const { modules } = model();
  const cur = B.currentId() || '';
  const curHub = model().topicHub[cur] || (model().hubs[cur] ? cur : '');
  const curMod = moduleOfId(cur);
  const open = new Set(store.get(OPEN_KEY, curMod ? [curMod.id] : []));
  if (curMod) open.add(curMod.id);
  // these are also in the dock, so on desktop the navigator shows only the pages
  const tool = (id, ic, label) => B.exists(id) ? `<button class="nv-nav-item nv-docked${cur === id ? ' is-active' : ''}" data-go="${esc(id)}">${icon(ic)}<span>${esc(label)}</span></button>` : '';
  const modRow = m => {
    const lecs = Object.keys(KIND).flatMap(k => (m.groups[k] || []).map(hb => ({ hb, k })));
    const isOpen = open.has(m.id);
    return `<div class="nv-nav-mod${isOpen ? ' is-open' : ''}" style="--mod:${m.color}" data-mod="${esc(m.id)}">
      <div class="nv-nav-modrow${cur === m.id ? ' is-active' : ''}"><button class="nv-nav-caret" data-toggle="${esc(m.id)}" aria-label="Expand">${icon('chevron-right')}</button><button class="nv-nav-modname" data-go="${esc(m.id)}"><i></i><span>${esc(m.title)}</span></button></div>
      <div class="nv-nav-lecs">${lecs.length ? lecs.map(({ hb, k }, i) => {
        const head = k !== 'lecture' && (i === 0 || lecs[i - 1].k !== k) ? `<div class="nv-nav-sub">${KIND[k]}</div>` : '';
        const pr = readOf(hb.id);
        return `${head}<button class="nv-nav-lec${curHub === hb.id ? ' is-active' : ''}" data-go="${esc(hb.id)}" title="${esc(hb.title)}"><b>${hb.number ? plainNum(hb.number) : '·'}</b><span>${esc(hb.title)}</span>${pr ? `<em style="--p:${Math.round(pr * 100)}%"></em>` : ''}</button>`;
      }).join('') : '<div class="nv-nav-empty">Nothing here yet</div>'}</div></div>`;
  };
  const pageRow = p => `<div class="nv-nav-mod" style="--mod:${p.color}">
      <div class="nv-nav-modrow${cur === p.id ? ' is-active' : ''}"><button class="nv-nav-caret" style="visibility:hidden" tabindex="-1" aria-hidden="true">${icon('chevron-right')}</button><button class="nv-nav-modname" data-go="${esc(p.id)}"><i></i><span>${esc(p.label)}</span></button></div></div>`;
  root.innerHTML = `<nav class="nv-nav">
    ${tool(B.V.home, 'home', 'Home')}
    <div class="nv-nav-label">Pages</div>
    ${modules.map(modRow).join('')}
    ${PAGES().filter(p => !model().modules.some(m => m.id === p.id)).map(pageRow).join('')}
    ${CUE().isAdmin ? `<div class="nv-nav-mod" style="--mod:#8B9CFF"><div class="nv-nav-modrow"><button class="nv-nav-caret" style="visibility:hidden" tabindex="-1" aria-hidden="true">${icon('chevron-right')}</button><a class="nv-nav-modname" href="/admin" style="text-decoration:none"><i></i><span>Admin panel</span></a></div></div>` : ''}
    <div class="nv-nav-label nv-docked">Library</div>
    <button class="nv-nav-item nv-docked" data-navmap>${icon('graph')}<span>Neural map</span></button>
  </nav>`;
  root.onclick = e => {
    const t = e.target.closest('[data-toggle]');
    if (t) {
      const mod = t.closest('.nv-nav-mod'); mod.classList.toggle('is-open');
      const s = new Set(store.get(OPEN_KEY, [])); mod.classList.contains('is-open') ? s.add(t.dataset.toggle) : s.delete(t.dataset.toggle); store.set(OPEN_KEY, [...s]);
      return;
    }
    if (e.target.closest('[data-navmap]')) { N.map && N.map.open(B.currentId()); return; }
    const g = e.target.closest('[data-go]');
    if (g) goFrom(g);
  };
}
window.addEventListener('hashchange', () => { if (B.isNova()) setTimeout(() => { const el = $('#explorer'); if (el) navPane(el); }, 0); });

/* ---------------------------------------------------------------- accordion gallery (React Bits port, CSS transitions instead of GSAP) */
function accordion(items, opts = {}) {
  const ratio = Math.min(Math.max(opts.expandRatio || 0.5, 0.2), 0.9);
  const count = items.length;
  const grow = count > 1 ? (ratio * (count - 1)) / (1 - ratio) : 1;
  const root = h(`<div class="accordion-gallery" role="list">${items.map((it, i) => `
    <a class="ag-panel" role="listitem" tabindex="0" href="${esc(B.hashFor(it.id))}" data-i="${i}" style="--mod:${it.color}" aria-label="${esc(it.label)}">
      <span class="ag-panel__frame"><span class="ag-panel__glow"></span><span class="ag-panel__num">${plainNum(i + 1)}</span></span>
      <span class="ag-panel__label"><span class="ag-panel__bar"></span><span class="ag-panel__text"><b>${esc(it.label)}</b>${it.tagline ? `<em>${esc(it.tagline)}</em>` : ''}<small>${esc(it.meta || '')}</small></span></span>
    </a>`).join('')}</div>`);
  const panels = $$('.ag-panel', root);
  let active = Math.min(opts.defaultIndex || 0, count - 1);
  const apply = () => panels.forEach((p, i) => {
    const on = i === active;
    p.classList.toggle('ag-panel--active', on);
    p.style.flexGrow = on ? grow : 1;
    if (on) p.setAttribute('aria-current', 'true'); else p.removeAttribute('aria-current');
  });
  panels.forEach((p, i) => {
    p.addEventListener('mouseenter', () => { if (window.matchMedia('(hover: hover)').matches) { active = i; apply(); } });
    p.addEventListener('focus', () => { active = i; apply(); });
    p.addEventListener('click', e => { e.preventDefault(); if (i !== active) { active = i; apply(); return; } B.go(items[i].id); });
    p.addEventListener('keydown', e => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); panels[(i + 1) % count].focus(); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); panels[(i - 1 + count) % count].focus(); }
      else if (e.key === 'Enter') { e.preventDefault(); B.go(items[i].id); }
    });
  });
  apply();
  return root;
}


/* ---------------------------------------------------------------- CUE data helpers */
const fmtDate = (iso, long) => new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', long ? { day: 'numeric', month: 'long', year: 'numeric' } : { day: 'numeric', month: 'short' });
const daysTo = iso => Math.max(0, Math.ceil((Date.parse(iso + 'T00:00:00') - Date.now()) / 864e5));
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
function richText(s) {
  return esc(s || '').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/__(.+?)__/g, '<u>$1</u>').replace(/\n/g, '<br>');
}

/* ---------------------------------------------------------------- home */
function showHome(view) {
  const bag = [];
  const C = CUE();
  const hr = new Date().getHours();
  const greet = hr < 5 ? 'Up late' : hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
  const name = C.user && C.user.name;
  const events = C.events || [], apps = C.applications || [], team = C.team || [];
  const next = events[0];
  const modules = C.wikiModules || [];
  view.innerHTML = `<div class="nv-page nv-home">
    <section class="nv-hero">
      <div class="nv-laser" aria-hidden="true"></div>
      <div class="nv-hero-copy"><h1>${greet}${name ? ', ' + esc(name) : ''}</h1></div>
      <div class="nv-today" id="nv-today">
        ${next ? `<button class="nv-today-cell nv-today-wide" data-go="${esc(next.wiki && B.exists(next.wiki) ? next.wiki : 'events')}"><span class="nv-today-k">Next event</span><b class="nv-today-title">${esc(next.title)}</b><small>${esc(fmtDate(next.date, true))} · ${esc(next.setting)}</small></button>` : ''}
        <button class="nv-today-cell" data-go="events"><span class="nv-today-k">Days to go</span><b>${next ? daysTo(next.date) : 0}</b><small>${next ? 'Up to ' + esc(next.players) + ' players' : 'Upcoming events'}</small></button>
      </div>
    </section>
    <section class="nv-sec nv-live">
      <div class="nv-sec-head"><h2>Today</h2></div>
      <div class="nv-live-grid">
        <div class="nv-ms-col nv-todo-col"><div class="nv-ms-colhead"><span class="nv-kicker">Upcoming events</span><button class="nv-ms-all" data-go="events">Open ${icon('chevron-right')}</button></div>
          <div class="nv-ms-list">${events.length ? events.map(e => `<button class="nv-ms-item" data-go="${esc(e.wiki && B.exists(e.wiki) ? e.wiki : 'events')}"><span class="nv-ms-when">${esc(fmtDate(e.date))}</span><b>${esc(e.title)}</b><small>${esc(e.setting)} · up to ${esc(e.players)} players</small></button>`).join('') : '<div class="nv-empty">No events announced yet.</div>'}</div></div>
        <div class="nv-ms-col"><div class="nv-ms-colhead"><span class="nv-kicker">Applications</span><button class="nv-ms-all" data-go="applications">Open ${icon('chevron-right')}</button></div>
          <div class="nv-ms-list">${apps.length ? apps.map(a => `<button class="nv-ms-item" data-go="applications"><span class="nv-ms-when">Open</span><b>${esc(a.title)}</b><small>${esc(a.detail || '')}</small></button>`).join('') : `<div class="nv-empty">${next ? 'Applications for ' + esc(next.title) + ' open soon.' : 'No applications are open.'}</div>`}</div></div>
        <div class="nv-ms-col"><div class="nv-ms-colhead"><span class="nv-kicker">Event wiki</span><button class="nv-ms-all" data-go="wiki">Open ${icon('chevron-right')}</button></div>
          <div class="nv-ms-list">${modules.length ? modules.map(m => { const t = m.text.match(/^Module (\d+):\s*(.*)$/); return `<button class="nv-ms-item" data-go="wiki" data-heading="${esc(m.id)}"><span class="nv-ms-when">${t ? plainNum(t[1]) : ''}</span><b>${esc(t ? t[2] : m.text)}</b><small>${esc(t ? 'Module ' + t[1] : '')}</small></button>`; }).join('') : '<div class="nv-empty">Nothing written yet.</div>'}</div></div>
      </div>
    </section>
  </div>`;
  view.onclick = e => { const g = e.target.closest('[data-go]'); if (g) goFrom(g); };
  const laser = $('.nv-laser', view);
  if (N._laserSeen) laser.classList.add('is-seen');
  mountGL(laser, 'laserFlow', { surfaceRef: { current: $('#nv-today', view) }, beamPosition: 0.72, color: '#8B5CF6', intensity: 1.3, fog: 0, dust: 0.8, speed: 0.9, spread: 1, spill: 0.6, intro: !N._laserSeen }, bag);
  N._laserSeen = true;
  return destroyAll(bag);
}

/* ---------------------------------------------------------------- CUE pages, laid out like a module page */
function pageView(view, o) {
  view.innerHTML = `<div class="nv-page nv-module" style="--mod:${o.color}">
    <header class="nv-mod-head">
      <div class="nv-mod-text">
        <div class="nv-mod-bar"><button class="nv-back" data-go="${esc(B.V.home)}">${icon('arrow-left')} Home</button></div>
        <div class="nv-kicker">${esc(o.kicker)}</div>
        <h1>${esc(o.title)}</h1>
        ${o.lede ? `<p class="nv-lede">${esc(o.lede)}</p>` : ''}
      </div>
    </header>
    ${o.body}
  </div>`;
  view.onclick = e => {
    if (e.target.closest('[data-map]')) { N.map && N.map.open(B.currentId()); return; }
    const g = e.target.closest('[data-go]');
    if (g) { e.preventDefault(); goFrom(g); }
  };
}
const card = (n, title, sub, side, attrs = '') => `<a class="nv-lec" ${attrs}><span class="nv-lec-n">${n}</span><span class="nv-lec-body"><b>${title}</b><small>${sub}</small></span><span class="nv-lec-side">${side || ''}</span></a>`;
const pill = t => `<span class="nv-pill">${esc(t)}</span>`;
const sec = (h, inner) => `<section class="nv-sec"><div class="nv-sec-head"><h2>${esc(h)}</h2></div>${inner}</section>`;
const discordCard = (n, label) => card(n, esc(label), 'discord.gg/x832cqAdu', icon('external'), `href="${esc(CUE().discord || 'https://discord.gg/x832cqAdu')}" target="_blank" rel="noopener"`);

B.registerView('applications', {
  title: () => 'Applications', icon: 'clipboard-list', cls: 'nv-view',
  show(view) {
    const C = CUE(), apps = C.applications || [], next = (C.events || [])[0];
    // one open application: go straight to its form, like the old Apply button
    if (apps.length === 1 && apps[0].href) { location.replace(apps[0].href); return; }
    pageView(view, {
      color: '#34D399', kicker: 'Apply', title: 'Applications',
      lede: apps.length ? 'Pick the application you want to fill in.' : (next ? `Applications for ${next.title} open soon. They will be announced in the Discord.` : 'No applications are open right now.'),
      body: apps.length ? sec('Open now', `<div class="nv-timeline">${apps.map((a, i) => card(plainNum(i + 1), esc(a.title), 'Start your application', pill('Apply'), `href="${esc(a.href)}"`)).join('')}</div>`)
        : `<section class="nv-sec"><div class="nv-timeline">${discordCard('·', 'Join the CUE Discord')}</div></section>`,
    });
  },
});

B.registerView('events', {
  title: () => 'Upcoming events', icon: 'calendar', cls: 'nv-view',
  show(view) {
    const events = CUE().events || [];
    pageView(view, {
      color: '#A78BFA', kicker: 'Events', title: 'Upcoming events', lede: '',
      body: `<section class="nv-sec">${events.length ? `<div class="nv-timeline">${events.map((e, i) => {
        const to = e.wiki && B.exists(e.wiki) ? `href="${esc(B.hashFor(e.wiki))}" data-go="${esc(e.wiki)}"` : '';
        return card(plainNum(i + 1), esc(e.title), esc(fmtDate(e.date, true)) + ' · ' + esc(e.setting) + ' · up to ' + esc(e.players) + ' players', pill(daysTo(e.date) + ' days'), to);
      }).join('')}</div>` : '<div class="nv-empty">No events announced yet.</div>'}</section>`,
    });
  },
});

B.registerView('store', {
  title: () => 'Store', icon: 'cart', cls: 'nv-view',
  show(view) {
    const C = CUE(), ranks = C.store || [];
    pageView(view, {
      color: '#38BDF8', kicker: 'Store', title: 'Store', lede: C.storeSub || '',
      body: sec('Ranks', `<div class="nv-timeline">${ranks.map((r, i) => card(plainNum(i + 1), esc(r.name) + ' · ' + esc(r.price), r.features.map(esc).join(' · '), pill(r.status))).join('')}</div>`)
        + (C.storeNote ? `<section class="nv-sec"><p class="nv-lede">${esc(C.storeNote)}</p></section>` : ''),
    });
  },
});

B.registerView('team', {
  title: () => 'The Team', icon: 'users', cls: 'nv-view',
  show(view) {
    const team = CUE().team || [];
    pageView(view, {
      color: '#FB7185', kicker: 'Staff', title: 'The Team', lede: 'The people building Collective Union Events.',
      body: sec('Roles', team.length ? `<div class="nv-timeline">${team.map((r, i) => card(plainNum(i + 1), esc(r.title), richText(r.description), r.pay ? pill(r.pay) : '')).join('')}</div>` : '<div class="nv-empty">No staff roles added yet.</div>')
        + sec('Join the team', `<div class="nv-timeline">${discordCard('·', 'Reach out in the CUE Discord')}</div>`),
    });
  },
});

/* ---------------------------------------------------------------- the event wiki
   Content comes from the server as rendered HTML plus a table of contents. Every heading has an
   id from its number (3.5.6 -> 3-5-6) and the address bar follows the section being read, as
   /wiki#3-5-6. Other scripts can add more versions of the wiki through window.CUE_WIKI_EXT;
   with more than one version the page shows a switch that keeps your place. */
const WIKI = { sources: [{ key: 'player', label: 'Field Manual', url: '/api/wiki/player' }], cache: {}, pref: null };
function wikiExtend() {
  const q = window.CUE_WIKI_EXT = window.CUE_WIKI_EXT || [];
  const run = f => { try { f(WIKI); } catch (e) { console.error(e); } };
  q.forEach(run); q.length = 0;
  q.push = f => { run(f); return 0; };
}
wikiExtend();
const wikiLoad = key => {
  const src = WIKI.sources.find(s => s.key === key) || WIKI.sources[0];
  return WIKI.cache[src.key] || (WIKI.cache[src.key] = fetch(src.url, { credentials: 'same-origin', cache: 'no-store' })
    .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .catch(e => { delete WIKI.cache[src.key]; throw e; }));
};
const wikiUrl = id => '/wiki' + (id ? '#' + id : '');

function showWiki(view, heading) {
  let alive = true, data = null, cur = heading || null, settling = 0;
  const keyNow = () => (WIKI.sources.some(s => s.key === WIKI.pref) ? WIKI.pref : WIKI.sources[0].key);
  view.innerHTML = `<div class="wk" style="--mod:#FBBF24">
    <aside class="wk-side">
      <div class="wk-switch-slot"></div>
      <button class="wk-toc-btn" type="button" aria-expanded="false">${icon('list')}<span>Contents</span></button>
      <nav class="wk-toc" aria-label="Contents"></nav>
    </aside>
    <article class="wk-doc markdown-preview-view markdown-rendered"><div class="wk-loading">Loading…</div></article>
  </div>`;
  const doc = $('.wk-doc', view), toc = $('.wk-toc', view), side = $('.wk-side', view);

  const sectionOf = id => { // the h3 a heading belongs to, for expanding the contents
    if (!data) return null;
    const i = data.toc.findIndex(h => h.id === id); if (i < 0) return null;
    for (let k = i; k >= 0; k--) if (data.toc[k].level <= 3) return data.toc[k];
    return null;
  };
  function drawToc() {
    const open = sectionOf(cur);
    let html = '';
    for (const h of data.toc) {
      if (h.level === 2) html += `<a class="wk-t wk-t2" href="${wikiUrl(h.id)}" data-id="${h.id}">${esc(h.text)}</a>`;
      else if (h.level === 3) html += `<a class="wk-t wk-t3" href="${wikiUrl(h.id)}" data-id="${h.id}">${esc(h.text)}</a>`;
      else if (h.level === 4 && open && sectionOf(h.id) === open) html += `<a class="wk-t wk-t4" href="${wikiUrl(h.id)}" data-id="${h.id}">${esc(h.text)}</a>`;
    }
    toc.innerHTML = html;
    mark();
  }
  function mark() {
    $$('.wk-t', toc).forEach(a => a.classList.toggle('is-active', a.dataset.id === cur));
    const on = $('.wk-t.is-active', toc);
    if (on && !side.classList.contains('is-open')) {
      const r = on.getBoundingClientRect(), tr = toc.getBoundingClientRect();
      if (r.top < tr.top || r.bottom > tr.bottom) toc.scrollTop += r.top - tr.top - tr.height / 3;
    }
  }
  const setCur = (id, push) => {
    if (!id || id === cur) return;
    const before = sectionOf(cur);
    cur = id;
    history.replaceState(null, '', wikiUrl(id));
    if (sectionOf(id) !== before) drawToc(); else mark();
  };
  // on narrow screens the switch and Contents bar stays stuck to the top, over the text
  const topGap = () => (getComputedStyle(side).position === 'sticky' && window.innerWidth <= 1000 ? side.offsetHeight : 0) + 16;
  const jump = (id, smooth) => {
    const el = id && doc.querySelector(`[id="${CSS.escape(id)}"]`);
    if (!el) return;
    view.scrollTo({ top: el.getBoundingClientRect().top - view.getBoundingClientRect().top + view.scrollTop - topGap(), behavior: smooth ? 'smooth' : 'instant' });
  };
  const spy = () => {
    if (!data || Date.now() < settling) return;
    const top = view.getBoundingClientRect().top + topGap() + 74;
    let id = null;
    for (const h of $$('h2[id], h3[id], h4[id], h5[id]', doc)) { if (h.getBoundingClientRect().top <= top) id = h.id; else break; }
    if (id) setCur(id);
  };
  // the same place in another version: this heading if it exists there, otherwise the closest one before it
  const nearest = (id, from, to) => {
    const ids = new Set(to.toc.map(h => h.id));
    if (ids.has(id)) return id;
    const i = from.toc.findIndex(h => h.id === id);
    for (let k = i - 1; k >= 0; k--) if (ids.has(from.toc[k].id)) return from.toc[k].id;
    return to.toc[0] && to.toc[0].id;
  };
  // a link to a section this version doesn't have opens the closest section before it by number
  const byNumber = (id, d) => {
    if (d.toc.some(h => h.id === id)) return id;
    if (!/^\d+(-\d+)*$/.test(id)) return null;
    const key = x => x.split('-').map(n => n.padStart(4, '0')).join('.');
    let best = null;
    for (const h of d.toc) if (/^\d+(-\d+)*$/.test(h.id) && key(h.id) <= key(id)) best = h.id;
    return best;
  };
  function drawSwitch() {
    const slot = $('.wk-switch-slot', view);
    if (WIKI.sources.length < 2) { slot.innerHTML = ''; return; }
    slot.innerHTML = `<div class="wk-switch" role="group" aria-label="Wiki version">${WIKI.sources.map(s => `<button type="button" data-ver="${esc(s.key)}" class="${s.key === keyNow() ? 'is-on' : ''}" aria-pressed="${s.key === keyNow()}">${esc(s.label)}</button>`).join('')}</div>`;
  }
  async function load(key, keepId) {
    let next;
    try { next = await wikiLoad(key); } catch (e) { if (alive) doc.innerHTML = '<div class="wk-loading">The wiki could not be loaded. Try again in a moment.</div>'; return; }
    if (!alive) return;
    const prev = data;
    data = next;
    WIKI.pref = data.version;
    try { localStorage.setItem('cue:wikiVersion', data.version); } catch (e) { /* storage blocked */ }
    doc.innerHTML = data.html;
    if (WIKI.sources.length > 1) doc.dataset.version = data.version; else delete doc.dataset.version;
    if (keepId && prev) cur = nearest(keepId, prev, data);
    else if (keepId) cur = byNumber(keepId, data);
    else cur = null;
    drawSwitch();
    drawToc();
    if (cur) {
      history.replaceState(null, '', wikiUrl(cur));
      const at = cur;
      // fonts and the table layout can still shift the page just after it renders, so the
      // section tracker waits until the jump has settled
      settling = Date.now() + 700;
      requestAnimationFrame(() => jump(at, false));
      setTimeout(() => { if (alive && cur === at) jump(at, false); }, 350);
    }
    else { view.scrollTop = 0; history.replaceState(null, '', wikiUrl()); }
  }

  view.addEventListener('scroll', spy, { passive: true });
  view.onclick = e => {
    const v = e.target.closest('[data-ver]');
    if (v) { if (v.dataset.ver !== (data && data.version)) load(v.dataset.ver, cur); return; }
    if (e.target.closest('.wk-toc-btn')) { const o = side.classList.toggle('is-open'); e.target.closest('.wk-toc-btn').setAttribute('aria-expanded', o); return; }
    const a = e.target.closest('a[href]');
    if (!a) return;
    const href = a.getAttribute('href');
    const id = href.startsWith('/wiki#') ? href.slice(6) : href.startsWith('#') && !href.startsWith('#/') ? href.slice(1) : null;
    if (id == null) return;
    e.preventDefault();
    side.classList.remove('is-open');
    if (a.classList.contains('wk-anchor') && navigator.clipboard) {
      navigator.clipboard.writeText(location.origin + wikiUrl(id)).then(() => B.toast('Link to this section copied')).catch(() => {});
    }
    jump(id, true);
    setCur(id);
  };
  try { WIKI.pref = WIKI.pref || localStorage.getItem('cue:wikiVersion'); } catch (e) { /* storage blocked */ }
  load(keyNow(), heading || null);
  return () => {
    alive = false;
    view.removeEventListener('scroll', spy);
    // leaving the wiki: drop the /wiki path so the next page's address is the plain one
    if (location.pathname === '/wiki') history.replaceState(null, '', '/' + location.hash);
  };
}
B.registerView('wiki', { title: () => 'Event wiki', icon: 'book-open', cls: 'nv-view nv-view-wiki', show: (view, id, heading) => showWiki(view, heading) });

/* ---------------------------------------------------------------- routing */
const DEFS = {
  home: { title: () => 'Home', icon: 'home', cls: 'nv-view', show: v => showHome(v) },
};
N.route = id => (B.V && id === B.V.home ? DEFS.home : null);
N.navigator = navPane;
N.model = model;
})();

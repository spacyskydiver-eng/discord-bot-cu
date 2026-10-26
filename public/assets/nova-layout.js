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
          <div class="nv-ms-list">${apps.length ? apps.map(a => `<button class="nv-ms-item" data-go="${esc(a.view || 'applications')}"><span class="nv-ms-when">Open</span><b>${esc(a.title)}</b><small>${esc(a.detail || '')}</small></button>`).join('') : `<div class="nv-empty">${next ? 'Applications for ' + esc(next.title) + ' open soon.' : 'No applications are open.'}</div>`}</div></div>
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
    if (apps.length === 1) {
      if (apps[0].view) { setTimeout(() => location.replace(B.hashFor(apps[0].view)), 0); return; }
      if (apps[0].href) { location.replace(apps[0].href); return; }
    }
    pageView(view, {
      color: '#34D399', kicker: 'Apply', title: 'Applications',
      lede: apps.length ? 'Pick the application you want to fill in.' : (next ? `Applications for ${next.title} open soon. They will be announced in the Discord.` : 'No applications are open right now.'),
      body: apps.length ? sec('Open now', `<div class="nv-timeline">${apps.map((a, i) => card(plainNum(i + 1), esc(a.title), esc(a.detail || 'Start your application'), pill('Apply'), a.view ? `href="${esc(B.hashFor(a.view))}" data-go="${esc(a.view)}"` : `href="${esc(a.href)}"`)).join('')}</div>`)
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

/* ---------------------------------------------------------------- times, like Discord's <t:...>
   Times arrive as UTC Unix seconds and are written into the page as <time data-ts> holding a UTC
   fallback. Here they're formatted in the visitor's own timezone and locale, with a countdown
   that keeps itself up to date. */
const TIME = {
  date(ts, withYear) {
    const d = new Date(ts * 1000);
    return new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long', ...(withYear || d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) }).format(d);
  },
  clock(ts, timeZone) {
    const f = new Intl.DateTimeFormat(timeZone ? 'en-GB' : undefined, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short', ...(timeZone ? { timeZone } : {}) });
    const tz = timeZone || f.resolvedOptions().timeZone;
    return f.formatToParts(ts * 1000).map(p => {
      if (p.type !== 'timeZoneName') return p.value;
      // some browsers print UK time as "GMT+0" / "GMT+1"; people know it as GMT and BST
      if (tz === 'Europe/London' || /^Europe\/(Jersey|Guernsey|Isle_of_Man)$/.test(tz)) return /\+1$/.test(p.value) || p.value === 'BST' ? 'BST' : 'GMT';
      return p.value.replace(/^(GMT|UTC)\+0$/, '$1');
    }).join('');
  },
  full: ts => `${TIME.date(ts)}, ${TIME.clock(ts)}`,
  // the UK time, when the visitor isn't on it
  uk(ts) {
    const here = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', day: 'numeric' }).format(ts * 1000);
    const there = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', day: 'numeric', timeZone: 'Europe/London' }).format(ts * 1000);
    return here === there ? '' : TIME.clock(ts, 'Europe/London') + ' in the UK';
  },
  rel(ts, minutes) {
    const diff = ts - Date.now() / 1000;
    if (Math.abs(diff) < 60) return 'starting now';
    if (diff < 0 && minutes && -diff < minutes * 60) return 'on now';
    const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
    const a = Math.abs(diff);
    if (a >= 86400) return rtf.format(Math.round(diff / 86400), 'day');
    if (a >= 3600) return rtf.format(Math.round(diff / 3600), 'hour');
    return rtf.format(Math.round(diff / 60), 'minute');
  },
  paint(root = document) {
    $$('time[data-ts]', root).forEach(t => {
      const ts = +t.dataset.ts;
      t.textContent = t.dataset.style === 'clock' ? TIME.clock(ts) : t.dataset.style === 'date' ? TIME.date(ts) : TIME.full(ts);
      t.title = new Date(ts * 1000).toUTCString();
    });
    $$('[data-rel]', root).forEach(e => { e.textContent = TIME.rel(+e.dataset.rel, +e.dataset.minutes || 0); });
    $$('[data-uk]', root).forEach(e => { const u = TIME.uk(+e.dataset.uk); e.textContent = u; e.hidden = !u; });
  },
};
// no-JS text for a time: "19:00 UTC"
const utcFallback = ts => new Date(ts * 1000).toISOString().slice(11, 16) + ' UTC';
const timeTag = (ts, style) => `<time datetime="${new Date(ts * 1000).toISOString()}" data-ts="${ts}"${style ? ` data-style="${style}"` : ''}>${utcFallback(ts)}</time>`;
setInterval(() => TIME.paint(), 15000);
N.time = TIME;

/* ---------------------------------------------------------------- tester applications */
const AGREEMENTS = [
  'I understand this session is recorded and the footage, including my Minecraft name, skin, gameplay and any voice chat, may be used in the event trailer and promotion.',
  'I understand this is a test: expect bugs and crashes, and nothing carries over to the real event.',
  "I'll follow the server rules and staff instructions. No cheats, hacks or exploit abuse; I'll report bugs instead.",
  "I won't share the modpack, server address or unreleased content outside the testers.",
  "If I can't make it, I'll withdraw so someone else gets my slot. I'm 13 or over, and if I'm under 18 a parent or guardian is OK with me taking part.",
];
const postJson = (url, body) => fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) })
  .then(async r => ({ ok: r.ok, status: r.status, data: await r.json().catch(() => ({})) }));

function showTesters(view) {
  let alive = true;
  view.innerHTML = `<div class="nv-page nv-module tst" style="--mod:#34D399">
    <header class="nv-mod-head"><div class="nv-mod-text">
      <div class="nv-mod-bar"><button class="nv-back" data-go="${esc(B.V.home)}">${icon('arrow-left')} Home</button></div>
      <div class="nv-kicker">Test sessions</div>
      <h1>Become a tester</h1>
      <p class="nv-lede">Before The Great War opens, we run test battles on prebuilt maps. They let us try out the event's systems with real players, and we record them for the event trailer. Each session has 50 places, two teams of 25, and lasts about an hour.</p>
    </div></header>
    <div class="tst-body"><div class="nv-empty">Loading…</div></div>
  </div>`;
  const body = $('.tst-body', view);
  let state = null;

  async function load() {
    const r = await fetch('/api/testers', { credentials: 'same-origin', cache: 'no-store' }).then(x => x.json()).catch(() => null);
    if (!alive) return;
    if (!r) { body.innerHTML = '<div class="nv-empty">This page could not be loaded. Try again in a moment.</div>'; return; }
    state = r;
    draw();
  }
  const myApp = s => state.me && state.me.applications.find(a => a.session_id === s.id);

  function sessionHead(s) {
    const left = s.slots - s.taken;
    return `<div class="tst-when">
        <div class="tst-time">${timeTag(s.starts_at)}</div>
        <div class="tst-meta"><span class="tst-rel" data-rel="${s.starts_at}" data-minutes="${s.duration_minutes}"></span><span data-uk="${s.starts_at}" hidden></span></div>
      </div>
      <div class="tst-slots"><b>${s.taken} of ${s.slots}</b> slots taken${left <= 0 ? ' · the waitlist is open' : ''}<div class="tst-bar"><i style="width:${Math.min(100, Math.round(s.taken / s.slots * 100))}%"></i></div></div>`;
  }
  const discordLink = () => `<a class="tst-btn" href="${esc(CUE().discord || 'https://discord.gg/x832cqAdu')}" target="_blank" rel="noopener">${icon('external')} Open our Discord</a>`;

  function panel(s) {
    const a = myApp(s);
    if (!state.signedIn) {
      return `<div class="tst-box"><p>Sign in with Discord to apply. We use your Discord account to give you the GW Testers role.</p>
        <a class="tst-btn tst-primary" href="/auth/discord?return=/testers">Sign in with Discord</a></div>`;
    }
    if (a && a.status === 'accepted') {
      const d = state.me.discord;
      const notIn = d && !d.inServer;
      return `<div class="tst-box tst-ok">
        <div class="tst-k">You're in</div>
        <h3>See you on ${timeTag(s.starts_at, 'date')} at ${timeTag(s.starts_at, 'clock')}</h3>
        ${a.team ? `<p>You're on <b>Team ${esc(a.team)}</b>.</p>` : ''}
        <p>Applied as <b>${esc(a.mc_name)}</b>. ${notIn ? '' : d && d.hasRole ? 'You have the GW Testers role on our Discord.' : ''}</p>
        ${notIn ? `<div class="tst-warn"><p><b>One more step:</b> you're not in our Discord server yet, so we can't give you the GW Testers role. Join the server, then come back and press the button below. If you join first, the bot gives you the role on its own.</p>
          <div class="tst-row">${discordLink()}<button class="tst-btn" data-act="retry">I've joined, give me the role</button></div></div>` : ''}
        <div class="tst-next"><div class="tst-k">What happens next</div>
          <ul><li>Before the session, staff share the modpack and how to join with everyone who has the GW Testers role on Discord.</li>
          <li>Be ready at the start time. The session lasts about an hour.</li>
          <li>If you can't make it any more, withdraw here so the next person on the waitlist gets your place.</li></ul></div>
        <div class="tst-row">${notIn ? '' : discordLink()}<button class="tst-btn tst-danger" data-act="withdraw" data-session="${s.id}">Withdraw</button></div>
      </div>`;
    }
    if (a && a.status === 'waitlisted') {
      return `<div class="tst-box tst-wait">
        <div class="tst-k">You're on the waitlist</div>
        <h3>Number ${a.position} in line</h3>
        <p>All ${s.slots} places are taken. If someone withdraws, the next person on the waitlist gets their place automatically, and our bot will message you on Discord and give you the GW Testers role.</p>
        <div class="tst-row"><button class="tst-btn tst-danger" data-act="withdraw" data-session="${s.id}">Leave the waitlist</button></div>
      </div>`;
    }
    if (a && a.status === 'removed') {
      return `<div class="tst-box"><p>Staff have removed you from this session. If you think that's a mistake, ask in our Discord.</p>${discordLink()}</div>`;
    }
    if (!s.open) return `<div class="tst-box"><p>Applications for this session are closed.</p></div>`;
    return form(s, a && a.status === 'withdrawn');
  }

  function form(s, again) {
    return `<form class="tst-form" data-session="${s.id}" novalidate>
      ${again ? '<p class="tst-note">You withdrew from this session. You can apply again; you\'ll join the back of the queue.</p>' : ''}
      ${s.taken >= s.slots ? `<p class="tst-note">All ${s.slots} places are taken, so applying puts you on the waitlist. If someone withdraws, the next person in line gets their place automatically.</p>` : ''}
      <fieldset><legend>Can you attend on ${timeTag(s.starts_at, 'date')} at ${timeTag(s.starts_at, 'clock')}?</legend>
        <label class="tst-choice"><input type="radio" name="attend" value="yes" required> Yes</label>
        <label class="tst-choice"><input type="radio" name="attend" value="no"> No</label></fieldset>
      <fieldset><legend>Can you play for the full hour?</legend>
        <label class="tst-choice"><input type="radio" name="full_hour" value="yes" required> Yes</label>
        <label class="tst-choice"><input type="radio" name="full_hour" value="no"> No</label></fieldset>
      <label class="tst-field"><span>Minecraft username</span>
        <input type="text" name="mc_name" autocomplete="off" spellcheck="false" maxlength="16" pattern="[A-Za-z0-9_]{3,16}" required placeholder="Your Java Edition username"></label>
      <fieldset class="tst-agree"><legend>Agreements</legend>
        ${AGREEMENTS.map((t, i) => `<label class="tst-check"><input type="checkbox" name="agree" value="${i + 1}" required><span>${esc(t)}</span></label>`).join('')}
      </fieldset>
      <div class="tst-error" role="alert" hidden></div>
      <button class="tst-btn tst-primary" type="submit">Apply</button>
    </form>`;
  }

  function needsBoth(s) {
    const joined = state.me && state.me.interest;
    return `<div class="tst-box">
      <h3>Thanks for wanting to help</h3>
      <p>This session needs testers who can be there at the start and play for the full hour, so we can't offer you a place in this one. We'll be running more sessions, though.</p>
      ${joined ? '<p><b>You\'re on the waitlist for future sessions.</b></p>' : `<p>Join the waitlist for future sessions and staff will see you're interested when the next one is planned.</p>
      <div class="tst-row"><button class="tst-btn tst-primary" data-act="interest">Join the waitlist for future sessions</button><button class="tst-btn" data-act="back">Back to the form</button></div>`}
    </div>`;
  }

  function draw(override) {
    const sessions = state.sessions.filter(s => s.open || myApp(s));
    if (!sessions.length) {
      body.innerHTML = `<section class="nv-sec"><div class="nv-empty">There are no test sessions open right now. New ones are announced in our Discord.</div></section>`;
      return;
    }
    body.innerHTML = sessions.map(s => `<section class="nv-sec tst-session" data-id="${s.id}">
      <div class="nv-sec-head"><h2>${esc(s.title)}</h2></div>
      <div class="tst-card">${sessionHead(s)}</div>
      <div class="tst-panel">${override && override.id === s.id ? override.html : panel(s)}</div>
    </section>`).join('');
    TIME.paint(body);
  }

  body.addEventListener('submit', async e => {
    const f = e.target.closest('.tst-form'); if (!f) return;
    e.preventDefault();
    const err = $('.tst-error', f), btn = $('button[type=submit]', f);
    const fail = msg => { err.textContent = msg; err.hidden = false; err.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); };
    err.hidden = true;
    const fd = new FormData(f);
    const attend = fd.get('attend'), full = fd.get('full_hour');
    const s = state.sessions.find(x => x.id === +f.dataset.session);
    if (!attend || !full) return fail('Please answer both questions about the session.');
    if (attend === 'no' || full === 'no') { draw({ id: s.id, html: needsBoth(s) }); return; }
    const mc = String(fd.get('mc_name') || '').trim();
    if (!/^[A-Za-z0-9_]{3,16}$/.test(mc)) return fail('Minecraft usernames are 3 to 16 letters, numbers or underscores.');
    const agree = fd.getAll('agree').map(Number);
    if (agree.length < 5) return fail('Please tick all five agreements.');
    btn.disabled = true; btn.textContent = 'Checking your username…';
    const r = await postJson('/api/testers/apply', { session_id: s.id, attend, full_hour: full, mc_name: mc, agree });
    if (!alive) return;
    btn.disabled = false; btn.textContent = 'Apply';
    if (r.data.error === 'needs-both') { draw({ id: s.id, html: needsBoth(s) }); return; }
    if (!r.ok) return fail(r.data.error || 'Something went wrong. Please try again.');
    await load();
    const top = $(`.tst-session[data-id="${s.id}"]`, view); if (top) top.scrollIntoView({ block: 'start', behavior: 'smooth' });
  });

  view.onclick = async e => {
    const g = e.target.closest('[data-go]'); if (g) { goFrom(g); return; }
    const b = e.target.closest('[data-act]'); if (!b) return;
    const act = b.dataset.act;
    if (act === 'back') { draw(); return; }
    if (act === 'withdraw') {
      if (!confirm('Withdraw from this session? Your place goes to the next person on the waitlist.')) return;
      b.disabled = true;
      await postJson('/api/testers/withdraw', { session_id: +b.dataset.session });
      await load(); return;
    }
    if (act === 'interest') {
      b.disabled = true;
      const r = await postJson('/api/testers/interest');
      if (r.ok) { state.me = state.me || { applications: [] }; state.me.interest = true; const sec = b.closest('.tst-session'); const s = state.sessions.find(x => x.id === +sec.dataset.id); draw({ id: s.id, html: needsBoth(s) }); }
      return;
    }
    if (act === 'retry') {
      b.disabled = true; b.textContent = 'Checking…';
      const r = await postJson('/api/testers/retry-role');
      if (r.ok && r.data.inServer) { await load(); return; }
      b.disabled = false; b.textContent = "I've joined, give me the role";
      B.toast(r.ok ? "We still can't see you in our Discord server. Join it, then try again." : (r.data.error || 'Please try again in a minute.'));
    }
  };

  load();
  return () => {
    alive = false;
    // leaving /testers: drop the path so the next page's address is the plain one
    if (location.pathname === '/testers') history.replaceState(null, '', '/' + location.hash);
  };
}
B.registerView('testers', { title: () => 'Testers', icon: 'clipboard-list', cls: 'nv-view', show: v => showTesters(v) });

/* ---------------------------------------------------------------- other scripts can add views and dock items */
(() => {
  const q = window.CUE_EXT = window.CUE_EXT || [];
  const api = { B, N, icon, esc, $, $$, h, TIME, timeTag, pageView, sec, card, pill };
  const run = f => { try { f(api); } catch (e) { console.error(e); } };
  q.forEach(run); q.length = 0;
  q.push = f => { run(f); return 0; };
})();

/* ---------------------------------------------------------------- routing */
const DEFS = {
  home: { title: () => 'Home', icon: 'home', cls: 'nv-view', show: v => showHome(v) },
};
N.route = id => (B.V && id === B.V.home ? DEFS.home : null);
N.navigator = navPane;
N.model = model;
})();

/* Served only to GW Staff and the owner (see routes/pages.js).
   - the wiki gets the Design Document as the Staff version, with a switch to the Player version
   - a read-only tester roster, from the staff-only /api/testers/roster */
(window.CUE_WIKI_EXT = window.CUE_WIKI_EXT || []).push(W => {
  W.sources = [
    { key: 'staff', label: 'Staff version', url: '/api/wiki/staff' },
    { key: 'player', label: 'Player version', url: '/api/wiki/player' },
  ];
});

window.CUE_DOCK_EXTRA = [{ id: 'roster', label: 'Tester roster', ic: 'list' }];

(window.CUE_EXT = window.CUE_EXT || []).push(({ B, icon, esc, $, TIME, timeTag, pageView }) => {
  B.registerView('roster', {
    title: () => 'Tester roster', icon: 'list', cls: 'nv-view',
    show(view) {
      pageView(view, { color: '#38BDF8', kicker: 'Staff', title: 'Tester roster', lede: 'Accepted testers for each upcoming session, by team. Read only; changes are made in the control centre.', body: '<div class="ros-body"><div class="nv-empty">Loading…</div></div>' });
      fetch('/api/testers/roster', { credentials: 'same-origin', cache: 'no-store' }).then(r => r.json()).then(sessions => {
        const list = ps => ps.length ? `<ol class="ros-list">${ps.map(p => `<li><b>${esc(p.mc_name)}</b> <span>${esc(p.discord_name || '')}</span></li>`).join('')}</ol>` : '<div class="nv-empty">Nobody yet.</div>';
        $('.ros-body', view).innerHTML = sessions.length ? sessions.map(s => {
          const by = t => s.players.filter(p => p.team === t);
          const none = s.players.filter(p => !p.team);
          return `<section class="nv-sec"><div class="nv-sec-head"><h2>${esc(s.title)}</h2></div>
            <p class="ros-when">${timeTag(s.starts_at)} · <span data-rel="${s.starts_at}" data-minutes="${s.duration_minutes}"></span> · ${s.taken} of ${s.slots} places, ${s.waitlisted} waitlisted</p>
            <div class="ros-teams">
              <div><h3>Team A (${by('A').length}/${s.team_size})</h3>${list(by('A'))}</div>
              <div><h3>Team B (${by('B').length}/${s.team_size})</h3>${list(by('B'))}</div>
            </div>
            ${none.length ? `<h3 class="ros-h">Not on a team yet (${none.length})</h3>${list(none)}` : ''}
          </section>`;
        }).join('') : '<section class="nv-sec"><div class="nv-empty">No upcoming sessions.</div></section>';
        TIME.paint(view);
      }).catch(() => { $('.ros-body', view).innerHTML = '<div class="nv-empty">The roster could not be loaded.</div>'; });
    },
  });
});

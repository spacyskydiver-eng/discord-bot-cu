/* Your account, at /account: the signed-in person's VIP tier, whether it's active in game, and their
   linked Minecraft account (link or change it here; anyone can, applied for anything or not). The VIP
   tier comes from their VIP or VIP+ role in our Discord, and only reaches the game servers through a
   linked Minecraft account. */
(window.CUE_EXT = window.CUE_EXT || []).push(({ B, icon, esc, $ }) => {
  const COLOR = '#FBBF24';
  const postJson = (url, body) => fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) })
    .then(async r => ({ ok: r.ok, data: await r.json().catch(() => ({})) })).catch(() => ({ ok: false, data: {} }));

  function show(view) {
    let alive = true, me = null, changing = false;
    const C = window.CUE || {};
    view.innerHTML = `<div class="nv-page nv-module tst acc" style="--mod:${COLOR}">
      <header class="nv-mod-head"><div class="nv-mod-text">
        <div class="nv-mod-bar"><button class="nv-back" data-go="${esc(B.V.home)}">${icon('arrow-left')} Home</button></div>
        <div class="nv-kicker">Your account</div>
        <h1>${C.user ? esc(C.user.name) : 'Your account'}</h1>
        <p class="nv-lede">Your VIP tier and your Minecraft account. The game servers give VIP perks to the Minecraft account linked here.</p>
      </div></header>
      <div class="acc-body"><div class="nv-empty">Loading…</div></div>
    </div>`;
    const body = $('.acc-body', view);

    async function load() {
      if (!C.user) { draw(); return; }
      me = await fetch('/api/me/minecraft', { credentials: 'same-origin', cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null);
      if (!alive) return;
      if (me) C.vip = me;     // keeps the home banner in step
      draw();
    }
    function draw() {
      if (!C.user) {
        body.innerHTML = `<section class="nv-sec"><div class="tst-box"><p>Sign in with Discord to see your VIP tier and link your Minecraft account.</p>
          <a class="tst-btn tst-primary" href="/auth/discord?return=/account">Sign in with Discord</a></div></section>`;
        return;
      }
      if (!me) { body.innerHTML = '<div class="nv-empty">This page could not be loaded. Try again in a moment.</div>'; return; }
      const vip = me.tier && me.tier !== 'none';
      const tierBox = me.tier === null
        ? `<div class="tst-box"><div class="tst-k">VIP</div><h3>Couldn't check</h3><p>We couldn't reach Discord to check your roles just now. Try again in a minute.</p></div>`
        : vip
          ? `<div class="tst-box ${me.linked ? 'tst-ok' : 'tst-wait'}"><div class="tst-k">Your tier</div><h3>${esc(me.tierName)}</h3>
              <p class="acc-state">${me.linked ? `${icon('check-circle')} <b>Active in game</b> on <b>${esc(me.mc_name)}</b>.` : `${icon('alert-triangle')} <b>Not active in game yet.</b> Link your Minecraft account below to unlock your perks.`}</p></div>`
          : `<div class="tst-box"><div class="tst-k">Your tier</div><h3>None</h3><p>VIP and VIP+ are cosmetic ranks for CUE events. If you buy one, it shows here within a minute or so.</p>
              <button class="tst-btn" data-go="store">${icon('cart')} See the ranks</button></div>`;
      const form = `<form class="acc-form" novalidate>
          <label class="tst-field"><span>Your Minecraft username</span><input type="text" name="name" maxlength="16" autocomplete="off" spellcheck="false" placeholder="Java Edition username" value="${changing && me.mc_name ? esc(me.mc_name) : ''}"></label>
          <div class="tst-error" role="alert" hidden></div>
          <div class="tst-row"><button class="tst-btn tst-primary" type="submit">${me.linked ? 'Save' : 'Link my account'}</button>${changing ? '<button class="tst-btn" type="button" data-act="cancel">Cancel</button>' : ''}</div>
        </form>`;
      const linkBox = me.linked && !changing
        ? `<div class="tst-box"><div class="tst-k">Minecraft account</div><h3>${esc(me.mc_name)}</h3><p>Linked to your Discord account.${vip ? ' Your VIP perks go to this account in game.' : ''}</p>
            <div class="tst-row"><button class="tst-btn" data-act="change">Change it</button></div></div>`
        : `<div class="tst-box"><div class="tst-k">Minecraft account</div><h3>${me.linked ? 'Change your account' : 'Link your account'}</h3>
            <p>Java Edition only. Each Minecraft account can be linked to one Discord account.</p>${form}</div>`;
      body.innerHTML = `<section class="nv-sec"><div class="nv-sec-head"><h2>VIP</h2></div>${tierBox}</section>
        <section class="nv-sec"><div class="nv-sec-head"><h2>Minecraft</h2></div>${linkBox}</section>`;
    }

    body.addEventListener('submit', async e => {
      e.preventDefault();
      const f = e.target, btn = $('button[type=submit]', f), err = $('.tst-error', f), label = btn.textContent;
      btn.disabled = true; btn.textContent = 'Checking…'; err.hidden = true;
      const r = await postJson('/api/me/minecraft', { name: f.elements.name.value });
      if (!alive) return;
      btn.disabled = false; btn.textContent = label;
      if (!r.ok) { err.textContent = r.data.error || 'Something went wrong. Please try again.'; err.hidden = false; return; }
      me = r.data; C.vip = me; changing = false; draw();
      B.toast(me.active ? `Linked. Your ${me.tierName} perks are active in game.` : 'Linked.');
    });
    view.onclick = e => {
      const g = e.target.closest('[data-go]'); if (g) { B.go(g.dataset.go); return; }
      const b = e.target.closest('[data-act]'); if (!b) return;
      if (b.dataset.act === 'change') { changing = true; draw(); const i = $('input[name=name]', body); if (i) i.focus(); }
      if (b.dataset.act === 'cancel') { changing = false; draw(); }
    };

    load();
    return () => {
      alive = false;
      if (location.pathname === '/account') history.replaceState(null, '', '/' + location.hash);
    };
  }
  B.registerView('account', { title: () => 'Your account', icon: 'key', cls: 'nv-view', show: v => show(v) });
});

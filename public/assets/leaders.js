/* Leader applications for The Great War, at /leaders.
   Step 1: the applicant and their four teammates (checked against our Discord server and Mojang).
   Teammates confirm or decline here. Step 2: the application, with a voice pitch recorded in the
   browser or a YouTube link. Then the applicant's own status, and for accepted Leaders the cabinet.
   Times arrive as UTC Unix seconds and are shown in the visitor's own timezone (TIME from nova-layout). */
(window.CUE_EXT = window.CUE_EXT || []).push(({ B, icon, esc, $, $$, TIME, timeTag }) => {
  const COLOR = '#F59E0B';
  const SCENARIOS = [
    ['a', "Your ally calls you into a war you'll probably lose. What do you do?"],
    ['b', 'Your best fighter keeps killing neutral players and another nation demands justice. What do you do?'],
    ['c', "You're down to 10 players, two seat holders want to defect, and your capital is under siege. What do you do?"],
    ['d', 'How do you keep 35+ people organised, active and listening?'],
  ];
  const commitments = info => [
    "I've read the Field Manual, especially Module 2 (Leading a Nation).",
    `I'll attend the leader brief on ${info.briefDate}. Missing it means my application is dropped.`,
    "I'll be active every session and lead on voice.",
    "I'll play fair and won't use my position to harass, exploit or cheat.",
    'Staff can replace me if I go inactive, abuse my position or ignore staff.',
    `If I'm accepted, I'll have ${info.discordSetupDays} days to set up my nation's Discord to staff standards and invite the CUE bot. I won't create it before I'm accepted, because I might be declined.`,
    'I understand the event is recorded and the footage, including my Minecraft name, skin, gameplay and any voice chat, may be used in the event trailer and promotion.',
    `I understand staff will see my application and my pitch, which are stored securely, seen only by staff, and deleted ${info.keepDaysAfterEvent} days after the event. I'm 13 or over, and if I'm under 18 a parent or guardian is OK with me taking part.`,
  ];
  // recordings from the browser's MediaRecorder carry no duration, so the player shows "Infinity" and
  // can't seek; jumping to the end once makes the browser work the length out
  const fixDuration = a => a.addEventListener('loadedmetadata', function once() {
    a.removeEventListener('loadedmetadata', once);
    if (a.duration !== Infinity) return;
    const back = () => { a.removeEventListener('timeupdate', back); a.currentTime = 0; };
    a.addEventListener('timeupdate', back);
    a.currentTime = 1e101;
  });
  const postJson = (url, body) => fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) })
    .then(async r => ({ ok: r.ok, status: r.status, data: await r.json().catch(() => ({})) }));
  const fmtLen = s => { const m = Math.floor(s / 60), x = Math.floor(s % 60); return `${m}:${String(x).padStart(2, '0')}`; };
  const STATUS_TONE = { Submitted: 'ok', Shortlisted: 'ok', 'Attended brief': 'ok', Declined: 'bad', Ended: 'bad', Incomplete: 'wait' };

  function show(view) {
    let alive = true, state = null, editTeam = false, ending = false, recorder = null;
    view.innerHTML = `<div class="nv-page nv-module tst ldr" style="--mod:${COLOR}">
      <header class="nv-mod-head"><div class="nv-mod-text">
        <div class="nv-mod-bar"><button class="nv-back" data-go="${esc(B.V.home)}">${icon('arrow-left')} Home</button></div>
        <div class="nv-kicker">The Great War</div>
        <h1>Lead a nation</h1>
        <p class="nv-lede">Eight nations, eight Leaders, each with a leadership team of four. Leading means running a nation of 35 or more people on voice, every session, fairly. Last time we learned that the quality of Leaders matters more than anything, so this application is strict: we would rather have fewer, better applicants.</p>
      </div></header>
      <div class="ldr-body"><div class="nv-empty">Loading…</div></div>
    </div>`;
    const body = $('.ldr-body', view);

    async function load() {
      const r = await fetch('/api/leaders', { credentials: 'same-origin', cache: 'no-store' }).then(x => x.json()).catch(() => null);
      if (!alive) return;
      if (!r) { body.innerHTML = '<div class="nv-empty">This page could not be loaded. Try again in a moment.</div>'; return; }
      state = r;
      draw();
    }

    /* ------------------------------------------------------------ pieces */
    const briefTag = info => info.briefAt ? `${timeTag(info.briefAt, 'date')} at ${timeTag(info.briefAt, 'clock')}` : `${esc(info.briefDate)} <span class="ldr-muted">(time to be announced)</span>`;
    function timeline(info) {
      return `<section class="nv-sec"><div class="nv-sec-head"><h2>How it works</h2></div>
        <ol class="ldr-steps">
          <li><b>Now until ${timeTag(info.closesAt, 'date')}, ${timeTag(info.closesAt, 'clock')} <span class="ldr-muted">(<span data-rel="${info.closesAt}"></span>)</span></b><span>Name your leadership team of four. Each of them confirms here. Then fill in the application, with a voice pitch. Only applications with all four teammates confirmed before the close are reviewed.</span></li>
          <li><b>Leader brief: ${briefTag(info)}</b><span>One session only. Every applicant must attend; only those who attend can be chosen.</span></li>
          <li><b>Staff choose the Leaders by ${esc(info.decideByLabel)}</b><span>You'll hear from our bot either way.</span></li>
          <li><b>Within ${info.discordSetupDays} days of being chosen</b><span>Set up your nation's Discord to staff standards and invite the CUE bot. Don't create it before you're accepted.</span></li>
        </ol></section>`;
    }
    const field = (name, label, value, opts = {}) => `<label class="tst-field ldr-f" data-field="${name}"><span>${label}</span>
      <input type="text" name="${name}" value="${esc(value || '')}" autocomplete="off" spellcheck="false"${opts.max ? ` maxlength="${opts.max}"` : ''}${opts.ph ? ` placeholder="${esc(opts.ph)}"` : ''}${opts.ro ? ' readonly' : ''}>
      <em class="ldr-ferr" hidden></em></label>`;
    const area = (name, label, value, max, ph) => `<label class="tst-field ldr-f ldr-area" data-field="${name}"><span>${label}</span>
      <textarea name="${name}" maxlength="${max}" rows="4"${ph ? ` placeholder="${esc(ph)}"` : ''}>${esc(value || '')}</textarea>
      <small class="ldr-count"><i>${(value || '').length}</i> / ${max}</small><em class="ldr-ferr" hidden></em></label>`;
    function showErrors(form, fields, msg) {
      $$('.ldr-ferr', form).forEach(e => { e.hidden = true; e.textContent = ''; });
      $$('.ldr-bad', form).forEach(e => e.classList.remove('ldr-bad'));
      const err = $('.tst-error', form);
      let first = null;
      for (const [k, v] of Object.entries(fields || {})) {
        const f = form.querySelector(`[data-field="${CSS.escape(k)}"]`);
        if (!f) continue;
        f.classList.add('ldr-bad');
        const e = $('.ldr-ferr', f); if (e) { e.textContent = v; e.hidden = false; }
        first = first || f;
      }
      if (msg) { err.textContent = msg; err.hidden = false; }
      (first || err).scrollIntoView({ block: 'center', behavior: 'smooth' });
    }

    /* ------------------------------------------------------------ teammates' invitations */
    function invitationCards() {
      const inv = (state.me && state.me.invitations) || [];
      if (!inv.length) return '';
      return `<section class="nv-sec"><div class="nv-sec-head"><h2>Leadership team invitation${inv.length > 1 ? 's' : ''}</h2></div>${inv.map(i => i.status === 'confirmed'
        ? `<div class="tst-box tst-ok"><div class="tst-k">Confirmed</div><p>You're in <b>${esc(i.leader)}</b>'s leadership team, playing as <b>${esc(i.mc_name)}</b>. We'll tell you how their application goes.</p></div>`
        : `<form class="tst-box ldr-invite" data-id="${i.id}">
            <div class="tst-k">You've been named</div>
            <h3>${esc(i.leader)} wants you in their leadership team</h3>
            <p>Their application only counts if all four teammates confirm before applications close on ${timeTag(state.info.closesAt)}. If you'd rather not, decline and they can name someone else. You can only be on one team.</p>
            <label class="tst-check"><input type="checkbox" name="agree"><span>My Minecraft username <b>${esc(i.mc_name)}</b> is correct and I want to be in ${esc(i.leader)}'s leadership team.</span></label>
            <div class="tst-error" role="alert" hidden></div>
            <div class="tst-row"><button class="tst-btn tst-primary" type="button" data-act="confirm">Confirm</button><button class="tst-btn tst-danger" type="button" data-act="decline">Decline</button></div>
          </form>`).join('')}</section>`;
    }

    /* ------------------------------------------------------------ step 1: the team */
    function teamForm(app) {
      const info = state.info, me = app ? app.me : { discord: state.user.username, mc: '' };
      const team = app ? app.team : [];
      return `<form class="tst-form ldr-team" novalidate>
        <div class="tst-k">Step 1 · Your leadership team</div>
        <h3>Who leads with you</h3>
        <p class="tst-note">Name exactly ${info.teamSize} people, not counting yourself. Everyone must be a member of our Discord server, with a real Minecraft Java account. Each person can only be on one team. When you save, each teammate gets a message from our bot and a notice here to confirm.</p>
        <div class="ldr-pair">${field('self.discord', 'Your Discord username', me.discord, { ro: true })}${field('self.mc', 'Your Minecraft username', me.mc, { max: 16, ph: 'Java Edition username' })}</div>
        ${[1, 2, 3, 4].map(s => {
          const m = team.find(x => x.slot === s) || {};
          const locked = m.status === 'confirmed';
          const live = m.status === 'pending' || locked;
          return `<fieldset class="ldr-mate${locked ? ' ldr-locked' : ''}"><legend>Teammate ${s}${locked ? ' · confirmed' : m.status === 'declined' ? ' · declined, name someone else' : ''}</legend>
            <div class="ldr-pair">${field(`m${s}.discord`, 'Discord username', live ? m.discord : '', { ro: locked, ph: 'their username, not display name' })}${field(`m${s}.mc`, 'Minecraft username', live ? m.mc : '', { max: 16, ro: locked })}</div>
            ${locked ? '' : field(`m${s}.reason`, 'Why them? (short)', live ? m.reason : '', { max: info.limits.reason })}
          </fieldset>`;
        }).join('')}
        <div class="tst-error" role="alert" hidden></div>
        <div class="tst-row"><button class="tst-btn tst-primary" type="submit">${app ? 'Save my team' : 'Save and invite my team'}</button>${app ? '<button class="tst-btn" type="button" data-act="cancel-team">Cancel</button>' : ''}</div>
      </form>`;
    }
    const pillFor = s => `<span class="ldr-pill ldr-${s}">${{ pending: 'Pending', confirmed: 'Confirmed', declined: 'Declined', empty: 'Not named' }[s] || esc(s)}</span>`;
    function statusCard(app) {
      const info = state.info, editable = info.open && ['draft', 'submitted'].includes(app.stage);
      const tone = app.stage === 'accepted' ? 'ok' : STATUS_TONE[app.status] || 'ok';
      const next = {
        Incomplete: app.complete ? 'Your whole team has confirmed. Fill in the application below and submit it.' : `Waiting for your team. Your application only counts once all ${info.teamSize} have confirmed, before applications close on ${timeTag(info.closesAt)}.`,
        Submitted: `Submitted. Staff review complete applications after the close. Remember the leader brief on ${info.briefAt ? '' : esc(info.briefDate)}${info.briefAt ? timeTag(info.briefAt) : ''}: everyone must attend.`,
        Shortlisted: "You're on the shortlist. Make sure you attend the leader brief.",
        'Attended brief': `Thanks for attending the brief. Staff choose the Leaders by ${esc(info.decideByLabel)}.`,
        Declined: "Thank you for applying. You haven't been chosen as a Leader this time, but you're very welcome to apply as a player.",
        Ended: 'You withdrew this application.',
      }[app.status] || '';
      return `<section class="nv-sec"><div class="nv-sec-head"><h2>Your application</h2></div>
        <div class="tst-box ldr-status ldr-tone-${tone}">
          <div class="tst-k">Status</div><h3>${esc(app.status)}</h3>
          ${next ? `<p>${next}</p>` : ''}
          ${app.stage !== 'ended' ? `<table class="ldr-team-tab"><tr><th>Teammate</th><th>Minecraft</th><th>Status</th></tr>
            ${app.team.map(m => `<tr><td>${esc(m.discord || '—')}</td><td>${esc(m.mc || '—')}</td><td>${pillFor(m.status)}</td></tr>`).join('')}</table>` : ''}
          ${editable && app.team.some(m => m.status !== 'confirmed') ? '<div class="tst-row"><button class="tst-btn" data-act="edit-team">Change who you named</button></div>' : ''}
          ${app.stage === 'declined' ? '<div class="tst-row"><a class="tst-btn" href="/apply">Apply as a player</a></div>' : ''}
          ${app.stage === 'ended' && info.open ? '<div class="tst-row"><button class="tst-btn" data-act="restart">Start a new application</button></div>' : ''}
        </div></section>`;
    }

    /* ------------------------------------------------------------ step 2: the application */
    function appForm(app) {
      const info = state.info, f = app.form || {}, ans = f.answers || {};
      const prefs = (f.nation_prefs && f.nation_prefs.length === info.nations.length) ? f.nation_prefs : info.nations.map(n => n.key);
      const tzs = (Intl.supportedValuesOf ? Intl.supportedValuesOf('timeZone') : [Intl.DateTimeFormat().resolvedOptions().timeZone]);
      const tz = f.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
      const voice = f.voice_kind || (app.recording ? 'recording' : 'recording');
      const nameOf = k => info.nations.find(n => n.key === k).name;
      return `<form class="tst-form ldr-app" novalidate>
        <div class="tst-k">Step 2 · The application</div>
        <h3>${f.submitted_at ? 'Your application (you can still change it until the close)' : 'Your application'}</h3>
        <fieldset data-field="nation_prefs"><legend>Nation preference: rank all ${info.nations.length}, your first choice at the top</legend>
          <ol class="ldr-rank">${prefs.map(k => `<li data-key="${k}"><span>${esc(nameOf(k))}</span><button type="button" class="ldr-mini" data-act="up" aria-label="Move ${esc(nameOf(k))} up">${icon('chevron-down', 'ldr-up')}</button><button type="button" class="ldr-mini" data-act="down" aria-label="Move ${esc(nameOf(k))} down">${icon('chevron-down')}</button></li>`).join('')}</ol>
          <em class="ldr-ferr" hidden></em></fieldset>
        <fieldset data-field="timezone"><legend>Availability</legend>
          <label class="tst-field"><span>Your timezone</span><select name="timezone">${tzs.map(z => `<option${z === tz ? ' selected' : ''}>${esc(z)}</option>`).join('')}</select></label>
          <p class="ldr-q">Can you attend the leader brief on ${briefTag(info)}?</p>
          <label class="tst-choice"><input type="radio" name="attend_brief" value="yes"${f.submitted_at ? ' checked' : ''}> Yes</label><label class="tst-choice"><input type="radio" name="attend_brief" value="no"> No</label>
          <p class="ldr-q">Can you attend every event session and lead on voice?</p>
          <label class="tst-choice"><input type="radio" name="attend_sessions" value="yes"${f.submitted_at ? ' checked' : ''}> Yes</label><label class="tst-choice"><input type="radio" name="attend_sessions" value="no"> No</label>
          <em class="ldr-ferr" hidden></em></fieldset>
        <fieldset><legend>Experience</legend>
          ${area('experience', 'Leadership in games or communities: where, how many people, and what happened', f.experience, info.limits.experience)}
          <div class="ldr-pair">${field('ref_server', 'Reference: a server or community', f.ref_server, { max: 120 })}${field('ref_person', 'Someone there who can vouch for you (and how to reach them)', f.ref_person, { max: 160 })}</div></fieldset>
        <fieldset><legend>Scenarios <span class="ldr-muted">(up to ${info.limits.scenario} characters each)</span></legend>
          ${SCENARIOS.map(([k, q]) => area('answers.' + k, `${k}) ${esc(q)}`, ans[k], info.limits.scenario)).join('')}</fieldset>
        <fieldset><legend>Plan</legend>
          ${area('plan', "Your nation's first week", f.plan, info.limits.plan)}</fieldset>
        <fieldset data-field="voice"><legend>Your voice pitch <span class="ldr-req">required</span></legend>
          <p class="ldr-callout">${icon('mic')} <b>Video applications are much more likely to be accepted.</b> Record a 2 to 3 minute pitch here, or paste a YouTube link (unlisted is fine). Your voice is what matters; you don't need to show your face.</p>
          <p class="tst-note">Cover: who you are, your leadership experience, your nation's plan, and how you'd handle a crisis.</p>
          <div class="ldr-tabs"><label class="tst-choice"><input type="radio" name="voice_kind" value="recording"${voice === 'recording' ? ' checked' : ''}> Record it here</label><label class="tst-choice"><input type="radio" name="voice_kind" value="youtube"${voice === 'youtube' ? ' checked' : ''}> YouTube link</label></div>
          <div class="ldr-voice ldr-rec"${voice === 'recording' ? '' : ' hidden'}>
            <div class="ldr-recbox">
              <div class="ldr-rectime"><span class="ldr-dot"></span><b class="ldr-clock">0:00</b> <span class="ldr-muted">/ ${fmtLen(info.recording.max)} max</span></div>
              <div class="tst-row"><button type="button" class="tst-btn tst-primary" data-act="rec-start">${icon('mic')} Start recording</button><button type="button" class="tst-btn" data-act="rec-stop" disabled>Stop</button></div>
              <div class="ldr-take" hidden><p class="ldr-q">Listen back before you use it:</p><audio controls class="ldr-preview"></audio>
                <div class="tst-row"><button type="button" class="tst-btn tst-primary" data-act="rec-upload">Use this recording</button><button type="button" class="tst-btn" data-act="rec-again">Record again</button></div></div>
              <div class="ldr-saved"${app.recording ? '' : ' hidden'}><p class="ldr-q">${icon('check')} Your saved pitch (${app.recording ? fmtLen(app.recording.seconds) : ''}):</p><audio controls preload="metadata" src="/api/leaders/recording?t=${app.recording ? app.recording.at : 0}"></audio></div>
            </div>
          </div>
          <div class="ldr-voice ldr-yt"${voice === 'youtube' ? '' : ' hidden'}>${field('youtube_url', 'YouTube link', f.youtube_url, { max: 200, ph: 'https://youtu.be/…' })}</div>
          <em class="ldr-ferr" hidden></em></fieldset>
        <fieldset class="tst-agree" data-field="agree"><legend>Commitments <span class="ldr-muted">(all required)</span></legend>
          ${commitments(info).map((t, i) => `<label class="tst-check"><input type="checkbox" name="agree" value="${i + 1}"${f.submitted_at ? ' checked' : ''}><span>${esc(t)}</span></label>`).join('')}
          <em class="ldr-ferr" hidden></em></fieldset>
        <div class="tst-error" role="alert" hidden></div>
        <button class="tst-btn tst-primary" type="submit">${f.submitted_at ? 'Save my changes' : 'Submit my application'}</button>
      </form>`;
    }
    function endCard() {
      return `<div class="tst-box"><h3>Thank you for being honest</h3>
        <p>Every Leader has to be at the leader brief on ${briefTag(state.info)} and at every event session, leading on voice. If you can't, we can't take your application this time. Ending it frees your teammates to join another team.</p>
        <p>There's still a place for you in The Great War as a player.</p>
        <div class="tst-row"><button class="tst-btn tst-danger" data-act="end">End my application</button><button class="tst-btn" data-act="back">Back to the form</button></div></div>`;
    }

    /* ------------------------------------------------------------ the cabinet */
    function cabinetCard(app) {
      const cab = app.cabinet, info = state.info;
      return `<section class="nv-sec"><div class="nv-sec-head"><h2>Your cabinet · ${esc(app.accepted_nation.name)}</h2></div>
        <div class="tst-box tst-ok">
          <div class="tst-k">Leader of ${esc(app.accepted_nation.name)}</div>
          ${app.discord_deadline ? `<p>Set up ${esc(app.accepted_nation.name)}'s Discord to staff standards and invite the CUE bot by <b>${timeTag(app.discord_deadline)}</b> <span class="ldr-muted">(<span data-rel="${app.discord_deadline}"></span>)</span>.</p>` : ''}
          <p>Your team hold the first seats. ${cab.open ? `You can fill the other ${cab.size - cab.seats.length > 0 ? cab.size - cab.seats.length : 0} from your assigned players.` : `From ${timeTag(cab.opensAt)} you can fill the other ${cab.size - cab.seats.length} from your assigned players.`} The order below is your <b>succession</b>: if you fall, the first seat holder leads. It's sent to the game server at the event start.</p>
          <ol class="ldr-cab">${cab.seats.map((s, i) => `<li data-id="${esc(s.discord_id)}"><span><b>${esc(s.discord_name)}</b> <span class="ldr-muted">${esc(s.mc_name)}${s.source === 'team' ? ' · your team' : ''}</span></span>
            <button type="button" class="ldr-mini" data-act="cab-up" ${i ? '' : 'disabled'} aria-label="Move up">${icon('chevron-down', 'ldr-up')}</button><button type="button" class="ldr-mini" data-act="cab-down" ${i < cab.seats.length - 1 ? '' : 'disabled'} aria-label="Move down">${icon('chevron-down')}</button>
            ${s.source === 'player' ? `<button type="button" class="ldr-mini" data-act="cab-remove" aria-label="Empty this seat">${icon('x')}</button>` : ''}</li>`).join('')}</ol>
          ${cab.open && cab.seats.length < cab.size ? `<div class="ldr-add"><select class="ldr-players" aria-label="Assigned player"><option value="">Loading your assigned players…</option></select>
            <input type="text" class="ldr-addmc" placeholder="Their Minecraft username" maxlength="16" autocomplete="off" spellcheck="false" aria-label="Their Minecraft username">
            <button type="button" class="tst-btn" data-act="cab-add">Give a seat</button></div><p class="ldr-muted ldr-addnote" hidden></p>` : ''}
        </div></section>`;
    }

    /* ------------------------------------------------------------ the page */
    function draw() {
      const info = state.info, me = state.me, app = me && me.app;
      let html = timeline(info);
      if (!state.signedIn) {
        html += `<section class="nv-sec"><div class="tst-box"><p>Sign in with Discord to apply, or to answer a leadership team invitation.</p>
          <a class="tst-btn tst-primary" href="/auth/discord?return=/leaders">Sign in with Discord</a></div></section>`;
      } else {
        html += invitationCards();
        const inTeam = (me.invitations || []).find(i => i.status === 'confirmed');
        const live = app && app.stage !== 'ended';
        if (app) html += statusCard(app);
        if (app && app.stage === 'accepted') html += cabinetCard(app);
        let form = '';
        if (!info.open) {
          if (!app || app.status === 'Incomplete') form = `<div class="nv-empty">Leader applications closed on ${timeTag(info.closesAt)}.</div>`;
        } else if (inTeam && !live) {
          form = `<div class="nv-empty">You're in ${esc(inTeam.leader)}'s leadership team, so you can't also apply to lead. A person can only be on one team.</div>`;
        } else if (!app || (app.stage === 'ended' && editTeam)) {
          form = teamForm(null);
        } else if (live && ['draft', 'submitted'].includes(app.stage)) {
          form = editTeam ? teamForm(app) : ending ? endCard() : appForm(app);
        }
        if (form) html += `<section class="nv-sec ldr-step">${form}</section>`;
      }
      body.innerHTML = html;
      TIME.paint(body);
      wire();
    }

    function wire() {
      $$('audio', body).forEach(fixDuration);
      // character counters
      $$('.ldr-area textarea', body).forEach(t => t.addEventListener('input', () => { $('.ldr-count i', t.closest('.ldr-area')).textContent = t.value.length; }));
      // voice tabs
      $$('[name=voice_kind]', body).forEach(r => r.addEventListener('change', () => {
        $('.ldr-rec', body).hidden = r.value !== 'recording' && r.checked;
        $('.ldr-yt', body).hidden = r.value !== 'youtube' && r.checked;
        const v = $('[name=voice_kind]:checked', body).value;
        $('.ldr-rec', body).hidden = v !== 'recording'; $('.ldr-yt', body).hidden = v !== 'youtube';
      }));
      // "no" ends the application, politely
      $$('[name=attend_brief], [name=attend_sessions]', body).forEach(r => r.addEventListener('change', () => { if (r.value === 'no' && r.checked) { ending = true; draw(); } }));
      const sel = $('.ldr-players', body);
      if (sel) fetch('/api/leaders/cabinet/players', { credentials: 'same-origin', cache: 'no-store' }).then(r => r.json()).then(d => {
        const p = d.players || [];
        sel.innerHTML = p.length ? '<option value="">Choose one of your assigned players</option>' + p.map(x => `<option value="${esc(x.discord_id)}" data-mc="${esc(x.mc_name || '')}">${esc(x.discord_name)}</option>`).join('') : '<option value="">No assigned players yet</option>';
        const note = $('.ldr-addnote', body);
        if (note && (d.note || d.error)) { note.textContent = d.note || d.error; note.hidden = false; }
        // fill in the Minecraft name where we already know it
        sel.onchange = () => { const o = sel.selectedOptions[0]; const mc = $('.ldr-addmc', body); if (mc && o) mc.value = o.dataset.mc || ''; };
      }).catch(() => { sel.innerHTML = '<option value="">Could not load your players</option>'; });
    }

    /* ------------------------------------------------------------ recording in the browser */
    function recUi() {
      const box = $('.ldr-recbox', body);
      return box && { box, clock: $('.ldr-clock', box), start: $('[data-act=rec-start]', box), stop: $('[data-act=rec-stop]', box), take: $('.ldr-take', box), preview: $('.ldr-preview', box), dot: $('.ldr-dot', box) };
    }
    async function recStart() {
      const ui = recUi();
      if (!navigator.mediaDevices || !window.MediaRecorder) { B.toast("Your browser can't record here. Paste a YouTube link instead."); return; }
      let stream;
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch (e) { B.toast('Allow microphone access to record, or paste a YouTube link instead.'); return; }
      const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'].find(t => MediaRecorder.isTypeSupported(t)) || '';
      const mr = new MediaRecorder(stream, type ? { mimeType: type, audioBitsPerSecond: 64000 } : undefined);
      const chunks = [];
      const t0 = Date.now();
      recorder = { mr, stream, chunks, t0, blob: null, seconds: 0, timer: null };
      mr.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        clearInterval(recorder.timer);
        recorder.seconds = (Date.now() - t0) / 1000;
        recorder.blob = new Blob(chunks, { type: (mr.mimeType || type || 'audio/webm').split(';')[0] });
        const u = recUi(); if (!u) return;
        u.dot.classList.remove('on'); u.start.disabled = false; u.stop.disabled = true;
        fixDuration(u.preview);
        u.preview.src = URL.createObjectURL(recorder.blob);
        u.take.hidden = false;
      };
      mr.start(1000);
      ui.start.disabled = true; ui.stop.disabled = false; ui.take.hidden = true; ui.dot.classList.add('on');
      recorder.timer = setInterval(() => {
        const s = (Date.now() - t0) / 1000, u = recUi();
        if (u) u.clock.textContent = fmtLen(s);
        if (s >= state.info.recording.max) mr.stop();       // 5 minutes at most
      }, 250);
    }
    async function recUpload(btn) {
      if (!recorder || !recorder.blob) return;
      if (recorder.seconds < state.info.recording.min) { B.toast('Your pitch should be 2 to 3 minutes. This one is under a minute.'); return; }
      btn.disabled = true; btn.textContent = 'Uploading…';
      const r = await fetch('/api/leaders/recording', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': recorder.blob.type || 'audio/webm', 'X-Duration': String(Math.round(recorder.seconds)) }, body: recorder.blob })
        .then(async x => ({ ok: x.ok, data: await x.json().catch(() => ({})) })).catch(() => ({ ok: false, data: {} }));
      if (!alive) return;
      if (!r.ok) { btn.disabled = false; btn.textContent = 'Use this recording'; B.toast(r.data.error || 'The upload failed. Try again.'); return; }
      const keep = snapshot();
      recorder = null;
      await load();
      restore(keep);
      B.toast('Your pitch is saved.');
    }
    // keep what's typed in step 2 across a reload of the page data
    function snapshot() {
      const f = $('.ldr-app', body); if (!f) return null;
      const out = {};
      $$('input[type=text], textarea, select', f).forEach(e => { out[e.name] = e.value; });
      $$('input[type=radio]:checked, input[type=checkbox]:checked', f).forEach(e => { out[e.name + '=' + e.value] = true; });
      out._rank = $$('.ldr-rank li', f).map(li => li.dataset.key);
      return out;
    }
    function restore(s) {
      const f = $('.ldr-app', body); if (!f || !s) return;
      $$('input[type=text], textarea, select', f).forEach(e => { if (s[e.name] !== undefined) e.value = s[e.name]; });
      $$('input[type=radio], input[type=checkbox]', f).forEach(e => { if (s[e.name + '=' + e.value]) e.checked = true; });
      const ol = $('.ldr-rank', f);
      if (s._rank) s._rank.forEach(k => { const li = ol.querySelector(`[data-key="${k}"]`); if (li) ol.appendChild(li); });
      $$('.ldr-area textarea', f).forEach(t => { $('.ldr-count i', t.closest('.ldr-area')).textContent = t.value.length; });
    }

    /* ------------------------------------------------------------ events */
    body.addEventListener('submit', async e => {
      e.preventDefault();
      const f = e.target;
      const btn = $('button[type=submit]', f), label = btn.textContent;
      const fd = new FormData(f);
      if (f.classList.contains('ldr-team')) {
        const payload = { self: { discord: fd.get('self.discord'), mc: fd.get('self.mc') }, members: [1, 2, 3, 4].map(s => ({ slot: s, discord: fd.get(`m${s}.discord`), mc: fd.get(`m${s}.mc`), reason: fd.get(`m${s}.reason`) || '' })) };
        btn.disabled = true; btn.textContent = 'Checking everyone…';
        const r = await postJson('/api/leaders/team', payload);
        if (!alive) return;
        btn.disabled = false; btn.textContent = label;
        if (!r.ok) return showErrors(f, r.data.fields, r.data.error || 'Something went wrong. Please try again.');
        editTeam = false; state.me = r.data; draw();
        B.toast('Saved. Your teammates have been asked to confirm.');
        return;
      }
      if (f.classList.contains('ldr-app')) {
        const payload = {
          nation_prefs: $$('.ldr-rank li', f).map(li => li.dataset.key), timezone: fd.get('timezone'),
          attend_brief: fd.get('attend_brief'), attend_sessions: fd.get('attend_sessions'),
          experience: fd.get('experience'), ref_server: fd.get('ref_server'), ref_person: fd.get('ref_person'),
          answers: Object.fromEntries(SCENARIOS.map(([k]) => [k, fd.get('answers.' + k)])), plan: fd.get('plan'),
          voice_kind: fd.get('voice_kind'), youtube_url: fd.get('youtube_url') || '', agree: fd.getAll('agree').map(Number),
        };
        if (payload.attend_brief !== 'yes' || payload.attend_sessions !== 'yes') {
          if (!payload.attend_brief || !payload.attend_sessions) return showErrors(f, { timezone: 'Answer both availability questions.' }, 'Please answer both availability questions.');
          ending = true; draw(); return;
        }
        if (payload.voice_kind === 'recording' && recorder && recorder.blob) return showErrors(f, { voice: 'Press "Use this recording" to save your pitch first.' }, 'Save your recording first.');
        btn.disabled = true; btn.textContent = 'Submitting…';
        const r = await postJson('/api/leaders/submit', payload);
        if (!alive) return;
        btn.disabled = false; btn.textContent = label;
        if (!r.ok) return showErrors(f, r.data.fields, r.data.error === 'unavailable' ? 'Please answer both availability questions.' : r.data.error || 'Something went wrong. Please try again.');
        state.me = r.data; draw();
        body.scrollIntoView({ block: 'start', behavior: 'smooth' });
        B.toast(r.data.app && r.data.app.complete ? 'Submitted. Good luck!' : 'Submitted. It counts once all four teammates confirm.');
      }
    });

    view.onclick = async e => {
      const g = e.target.closest('[data-go]'); if (g) { B.go(g.dataset.go); return; }
      const b = e.target.closest('[data-act]'); if (!b) return;
      const act = b.dataset.act;
      if (act === 'up' || act === 'down') {
        const li = b.closest('li'), ol = li.parentNode;
        if (act === 'up' && li.previousElementSibling) ol.insertBefore(li, li.previousElementSibling);
        if (act === 'down' && li.nextElementSibling) ol.insertBefore(li.nextElementSibling, li);
        b.focus(); return;
      }
      if (act === 'edit-team') { editTeam = true; draw(); return; }
      if (act === 'cancel-team') { editTeam = false; draw(); return; }
      if (act === 'restart') { editTeam = true; draw(); return; }
      if (act === 'back') { ending = false; draw(); return; }
      if (act === 'end') {
        b.disabled = true;
        const r = await postJson('/api/leaders/end', { reason: 'unavailable for the brief or the sessions' });
        if (!r.ok) { b.disabled = false; B.toast(r.data.error || 'Please try again.'); return; }
        ending = false; await load(); return;
      }
      if (act === 'confirm' || act === 'decline') {
        const form = b.closest('.ldr-invite'), err = $('.tst-error', form);
        const agree = $('[name=agree]', form).checked;
        if (act === 'confirm' && !agree) { err.textContent = 'Tick the box to confirm your Minecraft username and that you want to join.'; err.hidden = false; return; }
        if (act === 'decline' && !confirm('Decline this invitation? They will be told so they can name someone else.')) return;
        b.disabled = true;
        const r = await postJson('/api/leaders/respond', { id: +form.dataset.id, accept: act === 'confirm', agree });
        if (!r.ok) { b.disabled = false; err.textContent = r.data.error || 'Please try again.'; err.hidden = false; return; }
        await load(); return;
      }
      if (act === 'rec-start') { recStart(); return; }
      if (act === 'rec-stop') { if (recorder && recorder.mr.state === 'recording') recorder.mr.stop(); return; }
      if (act === 'rec-again') { recorder = null; const u = recUi(); u.take.hidden = true; u.clock.textContent = '0:00'; return; }
      if (act === 'rec-upload') { recUpload(b); return; }
      if (act.startsWith('cab-')) {
        const ids = $$('.ldr-cab li', body).map(li => li.dataset.id);
        let r;
        if (act === 'cab-up' || act === 'cab-down') {
          const i = ids.indexOf(b.closest('li').dataset.id), j = act === 'cab-up' ? i - 1 : i + 1;
          [ids[i], ids[j]] = [ids[j], ids[i]];
          r = await postJson('/api/leaders/cabinet/order', { order: ids });
        } else if (act === 'cab-remove') {
          if (!confirm('Empty this seat?')) return;
          r = await postJson('/api/leaders/cabinet/remove', { discord_id: b.closest('li').dataset.id });
        } else if (act === 'cab-add') {
          const v = $('.ldr-players', body).value; if (!v) return;
          b.disabled = true;
          r = await postJson('/api/leaders/cabinet/add', { discord_id: v, mc_name: ($('.ldr-addmc', body) || {}).value || '' });
        }
        if (!r.ok) { B.toast(r.data.error || 'Please try again.'); b.disabled = false; return; }
        state.me = r.data; draw();
      }
    };

    load();
    return () => {
      alive = false;
      if (recorder && recorder.mr && recorder.mr.state === 'recording') recorder.mr.stop();
      if (location.pathname === '/leaders') history.replaceState(null, '', '/' + location.hash);
    };
  }
  B.registerView('leaders', { title: () => 'Lead a nation', icon: 'users', cls: 'nv-view', show: v => show(v) });
});

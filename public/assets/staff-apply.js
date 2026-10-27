/* Staff applications for The Great War, at /staff-apply.
   The three tracks, one form (the applicant ticks one or more tracks and ranks them; each ticked track
   adds its questions), the Operator's optional voice note, the Event Creator's portfolio, and then the
   applicant's own status, per track. The tracks' text and the questions come from the server
   (server/staff-apply.config.js and server/staff-apply.js), so the page and the review queue match.
   Times arrive as UTC Unix seconds and are shown in the visitor's own timezone (TIME from nova-layout). */
(window.CUE_EXT = window.CUE_EXT || []).push(({ B, icon, esc, $, $$, TIME, timeTag }) => {
  const COLOR = '#60A5FA';
  const DRAFT = 'cue:staffApplyDraft';
  const STATE = { review: ['Under review', 'pending'], accepted: ['Accepted', 'confirmed'], rejected: ['Not selected this time', 'declined'] };
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
  const postRaw = (url, blob, headers) => fetch(url, { method: 'POST', credentials: 'same-origin', headers, body: blob })
    .then(async r => ({ ok: r.ok, status: r.status, data: await r.json().catch(() => ({})) })).catch(() => ({ ok: false, data: {} }));
  const fmtLen = s => { const m = Math.floor(s / 60), x = Math.floor(s % 60); return `${m}:${String(x).padStart(2, '0')}`; };
  const store = {
    get() { try { return JSON.parse(localStorage.getItem(DRAFT) || 'null'); } catch (e) { return null; } },
    set(v) { try { localStorage.setItem(DRAFT, JSON.stringify(v)); } catch (e) { /* storage blocked */ } },
    clear() { try { localStorage.removeItem(DRAFT); } catch (e) { /* storage blocked */ } },
  };

  // a screenshot over the size limit is re-encoded in the browser as a JPEG, smaller each try
  async function shrink(file, maxBytes) {
    if (file.size <= maxBytes || !/^image\/(png|jpeg|webp)$/.test(file.type) || !window.createImageBitmap) return file;
    const bmp = await createImageBitmap(file);
    for (const [edge, q] of [[3200, 0.9], [2560, 0.85], [1920, 0.8]]) {
      const k = Math.min(1, edge / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas');
      c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', q));
      if (blob && blob.size <= maxBytes) return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
    }
    return file;
  }

  function show(view) {
    let alive = true, state = null, editing = false, recorder = null, saveTimer = null;
    view.innerHTML = `<div class="nv-page nv-module tst ldr sa" style="--mod:${COLOR}">
      <header class="nv-mod-head"><div class="nv-mod-text">
        <div class="nv-mod-bar"><button class="nv-back" data-go="${esc(B.V.home)}">${icon('arrow-left')} Home</button></div>
        <div class="nv-kicker">The Great War</div>
        <h1>Join the staff</h1>
        <p class="nv-lede">Three ways to help run The Great War: moderate while you play, run the event without playing, or help build it. Read the tracks, then tick the ones you want and rank them. You can apply for more than one.</p>
      </div></header>
      <div class="sa-body"><div class="nv-empty">Loading…</div></div>
    </div>`;
    const body = $('.sa-body', view);

    async function load() {
      const r = await fetch('/api/staff-apply', { credentials: 'same-origin', cache: 'no-store' }).then(x => x.json()).catch(() => null);
      if (!alive) return;
      if (!r) { body.innerHTML = '<div class="nv-empty">This page could not be loaded. Try again in a moment.</div>'; return; }
      state = r;
      draw();
    }
    const Q = k => esc(state.info.questions[k]);

    /* ------------------------------------------------------------ pieces */
    function timeline(info) {
      return `<section class="nv-sec"><div class="nv-sec-head"><h2>How it works</h2></div>
        <ol class="ldr-steps">
          <li><b>Now until ${timeTag(info.closesAt, 'date')}, ${timeTag(info.closesAt, 'clock')} <span class="ldr-muted">(<span data-rel="${info.closesAt}"></span>)</span></b><span>Read the three tracks, then fill in the form once. You can change your answers until staff start deciding.</span></li>
          <li><b>Decisions by ${esc(info.decideByLabel)}</b><span>Each track you ticked is decided on its own. You'll hear from our bot either way${info.briefDate ? `, before the leader brief on ${esc(info.briefDate)}` : ''}.</span></li>
          <li><b>If you're accepted</b><span>You get the staff role in our Discord and a message with your track and its rules. This page shows which track you got.</span></li>
        </ol></section>`;
    }
    const list = items => `<ul class="sa-list">${items.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;
    function trackCard(t, i) {
      return `<article class="sa-track">
        <div class="tst-k">Track ${i + 1}</div>
        <h3>${esc(t.name)}</h3>
        <p class="sa-tag">${esc(t.tagline)}</p>
        <p>${esc(t.intro)}</p>
        ${t.allowed.length ? `<div class="sa-h">Allowed</div>${list(t.allowed)}` : ''}
        ${t.notAllowed.length ? `<div class="sa-h">Not allowed</div><div class="sa-chips sa-no">${t.notAllowed.map(x => `<span>${esc(x)}</span>`).join('')}</div>` : ''}
        <div class="sa-h">Rules</div>${list(t.rules)}
      </article>`;
    }
    const tracksSection = info => `<section class="nv-sec"><div class="nv-sec-head"><h2>The three tracks</h2></div><div class="sa-tracks">${info.tracks.map(trackCard).join('')}</div></section>`;

    const field = (name, label, value, opts = {}) => `<label class="tst-field ldr-f" data-field="${name}"><span>${label}</span>
      <input type="${opts.type || 'text'}" name="${name}" value="${esc(value == null ? '' : value)}" autocomplete="off"${opts.type === 'number' ? ` inputmode="numeric" min="${opts.min}" max="${opts.max}"` : ` spellcheck="${opts.spell ? 'true' : 'false'}"`}${opts.len ? ` maxlength="${opts.len}"` : ''}${opts.ph ? ` placeholder="${esc(opts.ph)}"` : ''}${opts.ro ? ' readonly' : ''}>
      <em class="ldr-ferr" hidden></em></label>`;
    const area = (name, label, value, max, opts = {}) => `<label class="tst-field ldr-f ldr-area" data-field="${name}"><span>${label}</span>
      <textarea name="${name}" maxlength="${max}" rows="${opts.rows || 4}"${opts.ph ? ` placeholder="${esc(opts.ph)}"` : ''}>${esc(value || '')}</textarea>
      <small class="ldr-count"><i>${(value || '').length}</i> / ${max}</small><em class="ldr-ferr" hidden></em></label>`;
    const yesNo = (name, label, value, note) => `<div class="tst-field ldr-f" data-field="${name}"><span>${label}</span>${note ? `<p class="tst-note">${note}</p>` : ''}
      <label class="tst-choice"><input type="radio" name="${name}" value="yes"${value === 'yes' ? ' checked' : ''}> Yes</label><label class="tst-choice"><input type="radio" name="${name}" value="no"${value === 'no' ? ' checked' : ''}> No</label>
      <em class="ldr-ferr" hidden></em></div>`;
    const chips = (name, label, pairs, picked, other) => `<div class="tst-field ldr-f" data-field="${name}"><span>${label}</span>
      <div class="sa-chips">${pairs.map(([k, l]) => `<label class="tst-choice"><input type="checkbox" name="${name}" value="${k}"${(picked || []).includes(k) ? ' checked' : ''}> ${esc(l)}</label>`).join('')}</div>
      <em class="ldr-ferr" hidden></em></div>
      <div class="sa-other" data-other="${name}"${(picked || []).includes('other') ? '' : ' hidden'}>${field(name + '_other', 'Other: what?', other, { len: state.info.limits.short })}</div>`;
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
      if (msg) { err.textContent = msg; err.hidden = false; } else err.hidden = true;
      (first || err).scrollIntoView({ block: 'center', behavior: 'smooth' });
    }

    /* ------------------------------------------------------------ the status */
    function statusCard(app) {
      const info = state.info;
      const accepted = app.tracks.filter(t => t.state === 'accepted');
      const tone = app.withdrawn ? 'bad' : accepted.length ? 'ok' : app.tracks.every(t => t.state === 'rejected') ? 'bad' : 'wait';
      const next = app.withdrawn ? (info.open ? 'You withdrew this application. You can apply again until applications close.' : 'You withdrew this application.')
        : accepted.length ? `Welcome to the team. You have the staff role in our Discord, and our bot has sent you your track's rules.`
        : app.tracks.every(t => t.state === 'rejected') ? "Thank you for applying. You haven't been picked this time, but you're very welcome to play in the event."
        : app.locked ? `Staff have started deciding. You'll hear from our bot about every track by ${esc(info.decideByLabel)}.`
        : `Submitted. Staff decide by ${esc(info.decideByLabel)}. You can change your answers until they start.`;
      const byKey = Object.fromEntries(info.tracks.map(t => [t.key, t]));
      return `<section class="nv-sec"><div class="nv-sec-head"><h2>Your application</h2></div>
        <div class="tst-box ldr-status ldr-tone-${tone}">
          <div class="tst-k">Status</div><h3>${esc(app.status)}</h3>
          <p>${next}</p>
          ${app.withdrawn ? '' : `<table class="ldr-team-tab"><tr><th>Your choice</th><th>Track</th><th>Status</th></tr>
            ${app.tracks.map((t, i) => `<tr><td>${i + 1}</td><td>${esc(t.name)}</td><td><span class="ldr-pill ldr-${STATE[t.state][1]}">${STATE[t.state][0]}</span></td></tr>`).join('')}</table>`}
          ${accepted.map(t => `<details class="sa-mine"><summary>The ${esc(t.name)} rules</summary>${trackCard(byKey[t.key], info.tracks.indexOf(byKey[t.key]))}</details>`).join('')}
          <div class="tst-row">
            ${info.open && !app.locked && !app.withdrawn ? '<button class="tst-btn" data-act="edit">Change my answers</button><button class="tst-btn tst-danger" data-act="withdraw">Withdraw</button>' : ''}
            ${info.open && app.withdrawn ? '<button class="tst-btn tst-primary" data-act="edit">Apply again</button>' : ''}
          </div>
        </div></section>`;
    }

    /* ------------------------------------------------------------ the form */
    function form() {
      const info = state.info, L = info.limits, me = state.me || {}, app = me.app;
      const f = (app && app.form) || {}, a = f.answers || {};
      const tzs = Intl.supportedValuesOf ? Intl.supportedValuesOf('timeZone') : [Intl.DateTimeFormat().resolvedOptions().timeZone];
      const tz = f.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
      const picked = f.tracks || [];
      const order = [...picked, ...info.tracks.map(t => t.key).filter(k => !picked.includes(k))];
      const nameOf = k => info.tracks.find(t => t.key === k).name;
      const tools = a.op_tools || {};
      const voice = f.voice_kind || (me.recording ? 'recording' : 'none');
      const P = info.portfolio, V = info.voiceNote;
      return `<form class="tst-form sa-form" novalidate>
        <div class="tst-k">${app && !app.withdrawn ? 'Change your answers' : 'Apply'}</div>
        <h3>Your staff application</h3>
        <p class="tst-note">Answer in your own words. Everyone answers the first part; each track you tick adds a few questions of its own.</p>

        <fieldset><legend>About you</legend>
          <div class="ldr-pair">${field('discord', Q('discord'), state.user.username, { ro: true })}${field('mc_name', Q('mc_name'), f.mc_name, { len: 16, ph: 'Java Edition username' })}</div>
          <div class="ldr-pair">${field('age', Q('age'), f.age, { type: 'number', min: 1, max: 120 })}
            <label class="tst-field ldr-f" data-field="timezone"><span>${Q('timezone')}</span><select name="timezone">${tzs.map(z => `<option${z === tz ? ' selected' : ''}>${esc(z)}</option>`).join('')}</select><em class="ldr-ferr" hidden></em></label></div>
          <div class="ldr-pair">${field('hours_weekdays', Q('hours_weekdays'), f.hours_weekdays, { len: L.hours, ph: 'e.g. 18:00 to 22:00', spell: true })}${field('hours_weekends', Q('hours_weekends'), f.hours_weekends, { len: L.hours, ph: 'e.g. 12:00 to 23:00', spell: true })}</div>
        </fieldset>

        <fieldset class="tst-field" data-field="tracks"><legend>${Q('tracks')}</legend>
          <p class="tst-note">Tick every track you want, then move your first choice to the top.</p>
          <ol class="sa-rank">${order.map(k => `<li data-key="${k}"><b class="sa-n"></b>
            <label><input type="checkbox" name="track" value="${k}"${picked.includes(k) ? ' checked' : ''}> <span>${esc(nameOf(k))}</span></label>
            <button type="button" class="ldr-mini" data-act="up" aria-label="Move ${esc(nameOf(k))} up">${icon('chevron-down', 'ldr-up')}</button><button type="button" class="ldr-mini" data-act="down" aria-label="Move ${esc(nameOf(k))} down">${icon('chevron-down')}</button></li>`).join('')}</ol>
          <em class="ldr-ferr" hidden></em></fieldset>

        <fieldset><legend>Everyone</legend>
          ${area('staff_experience', Q('staff_experience'), a.staff_experience, L.long, { ph: 'Server, role, how long, why you left. Write "None" if you haven\'t been staff before.' })}
          ${yesNo('played_before', Q('played_before'), a.played_before)}
          <div class="sa-if" data-if="played_before">${field('played_detail', Q('played_detail'), a.played_detail, { len: L.short, spell: true })}</div>
          ${area('why', Q('why'), a.why, L.answer)}
          ${area('combat_log', Q('combat_log'), a.combat_log, L.answer, { rows: 5 })}
          ${area('toxic_chat', Q('toxic_chat'), a.toxic_chat, L.answer, { rows: 5 })}
          ${yesNo('punished', Q('punished'), a.punished, `<b>${Q('punished_note')}</b>`)}
          <div class="sa-if" data-if="punished">${area('punished_detail', Q('punished_detail'), a.punished_detail, L.answer)}</div>
        </fieldset>

        <fieldset class="sa-sec" data-track="event_staff"${picked.includes('event_staff') ? '' : ' hidden'}><legend>Event Staff</legend>
          ${yesNo('es_understand', Q('es_understand'), a.es_understand)}
          ${field('es_understand_why', Q('es_understand_why'), a.es_understand_why, { len: L.short * 2, spell: true })}
          ${area('es_report', Q('es_report'), a.es_report, L.answer)}
          ${field('es_hours', Q('es_hours'), a.es_hours, { type: 'number', min: 0, max: 168 })}
        </fieldset>

        <fieldset class="sa-sec" data-track="operator"${picked.includes('operator') ? '' : ' hidden'}><legend>Operator</legend>
          <div class="tst-field"><span>${Q('op_tools')}</span><p class="tst-note">1 means you've never used it, 5 means you know it inside out.</p>
            ${info.opTools.map(([k, l]) => `<div class="sa-tool ldr-f" data-field="op_tools.${k}"><b>${esc(l)}</b>
              <select name="op_tools.${k}.rating" aria-label="${esc(l)}: rating"><option value="">Rate</option>${[1, 2, 3, 4, 5].map(n => `<option${+((tools[k] || {}).rating) === n ? ' selected' : ''}>${n}</option>`).join('')}</select>
              <input type="text" name="op_tools.${k}.example" maxlength="${L.example}" value="${esc((tools[k] || {}).example || '')}" placeholder="An example of how you've used it" aria-label="${esc(l)}: example" autocomplete="off">
              <em class="ldr-ferr" hidden></em></div>`).join('')}</div>
          ${area('op_dupe', Q('op_dupe'), a.op_dupe, L.answer, { rows: 5 })}
          ${info.schedule.length ? `<div class="tst-field ldr-f" data-field="op_shifts"><span>${Q('op_shifts')}</span>
              ${info.schedule.map((s, i) => `<label class="tst-check"><input type="checkbox" name="op_shifts" value="${i}"${(a.op_shifts || []).some(x => x.startsAt === s.startsAt) ? ' checked' : ''}><span><b>${esc(s.label)}</b>: ${timeTag(s.startsAt)}, ${s.minutes} minutes</span></label>`).join('')}
              <em class="ldr-ferr" hidden></em></div>`
            : area('op_shifts_text', Q('op_shifts_text'), a.op_shifts_text, L.answer, { rows: 3 })}
          ${area('op_known', Q('op_known'), a.op_known, L.answer, { rows: 3, ph: 'Their names, or "None".' })}
          <div class="tst-field ldr-f" data-field="voice"><span>${Q('voice')}</span>
            <p class="tst-note">Record it here or paste a YouTube link (unlisted is fine). You don't need to show your face.</p>
            <div class="ldr-tabs"><label class="tst-choice"><input type="radio" name="voice_kind" value="none"${voice === 'none' ? ' checked' : ''}> No voice note</label><label class="tst-choice"><input type="radio" name="voice_kind" value="recording"${voice === 'recording' ? ' checked' : ''}> Record it here</label><label class="tst-choice"><input type="radio" name="voice_kind" value="youtube"${voice === 'youtube' ? ' checked' : ''}> YouTube link</label></div>
            <div class="ldr-voice ldr-rec"${voice === 'recording' ? '' : ' hidden'}>
              <div class="ldr-recbox">
                <div class="ldr-rectime"><span class="ldr-dot"></span><b class="ldr-clock">0:00</b> <span class="ldr-muted">/ ${fmtLen(V.maxSeconds)} max</span></div>
                <div class="tst-row"><button type="button" class="tst-btn tst-primary" data-act="rec-start">${icon('mic')} Start recording</button><button type="button" class="tst-btn" data-act="rec-stop" disabled>Stop</button></div>
                <div class="ldr-take" hidden><p class="ldr-q">Listen back before you use it:</p><audio controls class="ldr-preview"></audio>
                  <div class="tst-row"><button type="button" class="tst-btn tst-primary" data-act="rec-upload">Use this recording</button><button type="button" class="tst-btn" data-act="rec-again">Record again</button></div></div>
                <div class="ldr-saved"${me.recording ? '' : ' hidden'}><p class="ldr-q">${icon('check')} Your saved voice note (${me.recording ? fmtLen(me.recording.seconds) : ''}):</p><audio controls preload="metadata" src="/api/staff-apply/recording?t=${me.recording ? me.recording.at : 0}"></audio>
                  <div class="tst-row"><button type="button" class="tst-btn tst-danger" data-act="rec-delete">Delete it</button></div></div>
              </div>
            </div>
            <div class="ldr-voice ldr-yt"${voice === 'youtube' ? '' : ' hidden'}>${field('youtube_url', 'YouTube link', f.youtube_url, { len: 200, ph: 'https://youtu.be/…' })}</div>
            <em class="ldr-ferr" hidden></em></div>
        </fieldset>

        <fieldset class="sa-sec" data-track="creator"${picked.includes('creator') ? '' : ' hidden'}><legend>Event Creator</legend>
          ${chips('cr_makes', Q('cr_makes'), info.crafts, a.cr_makes, a.cr_makes_other)}
          <div class="tst-field ldr-f" data-field="cr_portfolio"><span>${Q('cr_portfolio')}</span>
            <p class="tst-note">Upload up to ${P.maxFiles} images, and add links for videos, world downloads or anything else (YouTube, Google Drive, Dropbox, Planet Minecraft…). Uploads and links count together.</p>
            <div class="sa-shots">${(me.files || []).map(x => `<figure><img src="/api/staff-apply/files/${x.id}" alt="${esc(x.name)}" loading="lazy"><button type="button" class="ldr-mini" data-act="file-delete" data-id="${x.id}" aria-label="Remove ${esc(x.name)}">${icon('x')}</button></figure>`).join('')}</div>
            <div class="tst-row sa-upload"><label class="tst-btn">${icon('upload')} Upload images<input type="file" accept="image/png,image/jpeg,image/gif,image/webp" multiple hidden></label><span class="ldr-muted sa-upnote"></span></div>
            ${area('cr_links', 'Links, one per line', (a.cr_links || []).join('\n'), 5000, { rows: 3, ph: 'https://…' })}
            <p class="ldr-muted sa-count"></p>
            <em class="ldr-ferr" hidden></em></div>
          ${chips('cr_tools', Q('cr_tools'), info.tools, a.cr_tools, a.cr_tools_other)}
          ${field('cr_hours', Q('cr_hours'), a.cr_hours, { type: 'number', min: 0, max: 168 })}
          ${yesNo('cr_accept', Q('cr_accept'), a.cr_accept)}
        </fieldset>

        <fieldset class="tst-agree" data-field="agree"><legend>Agreement <span class="ldr-req">required</span></legend>
          <label class="tst-check"><input type="checkbox" name="agree"${app && !app.withdrawn ? ' checked' : ''}><span>${Q('agree')}</span></label>
          <p class="tst-note sa-privacy">Your application is seen only by the CUE admin, and it's deleted ${info.keepDaysAfterEvent} days after the event, with any voice note and uploads. You must be ${info.minAge} or over.</p>
          <em class="ldr-ferr" hidden></em></fieldset>
        <div class="tst-error" role="alert" hidden></div>
        <div class="tst-row"><button class="tst-btn tst-primary" type="submit">${app && !app.withdrawn ? 'Save my changes' : 'Send my application'}</button>${app ? '<button class="tst-btn" type="button" data-act="cancel">Cancel</button>' : ''}</div>
      </form>`;
    }

    /* ------------------------------------------------------------ the page */
    function draw() {
      const info = state.info, me = state.me, app = me && me.app;
      let html = timeline(info) + tracksSection(info);
      if (!state.signedIn) {
        html += `<section class="nv-sec"><div class="tst-box"><p>Sign in with Discord to apply.</p>
          <a class="tst-btn tst-primary" href="/auth/discord?return=/staff-apply">Sign in with Discord</a></div></section>`;
      } else {
        if (app) html += statusCard(app);
        let f = '';
        if (!info.open) { if (!app) f = `<div class="nv-empty">Staff applications closed on ${timeTag(info.closesAt)}.</div>`; }
        else if (!app || editing) f = form();
        if (f) html += `<section class="nv-sec ldr-step sa-step">${f}</section>`;
      }
      body.innerHTML = html;
      TIME.paint(body);
      wire();
    }

    function wire() {
      $$('audio', body).forEach(fixDuration);
      const f = $('.sa-form', body);
      if (!f) return;
      $$('.ldr-area textarea', f).forEach(t => t.addEventListener('input', () => { $('.ldr-count i', t.closest('.ldr-area')).textContent = t.value.length; }));
      f.addEventListener('change', e => {
        const t = e.target;
        if (t.name === 'track') sync();
        if (t.name === 'played_before' || t.name === 'punished') sync();
        if (t.name === 'cr_makes' || t.name === 'cr_tools') sync();
        if (t.name === 'voice_kind') { const v = $('[name=voice_kind]:checked', f).value; $('.ldr-rec', f).hidden = v !== 'recording'; $('.ldr-yt', f).hidden = v !== 'youtube'; }
        if (t.type === 'file') upload(t);
      });
      f.addEventListener('input', e => { if (e.target.name === 'cr_links') count(); keep(); });
      f.addEventListener('change', keep);
      // a new application picks up where the visitor left off on this device
      if (!state.me || !state.me.app || state.me.app.withdrawn) restore(store.get());
      sync();
    }
    // what's shown follows what's ticked
    function sync() {
      const f = $('.sa-form', body); if (!f) return;
      let n = 0;
      $$('.sa-rank li', f).forEach(li => { const on = $('input', li).checked; li.classList.toggle('sa-on', on); $('.sa-n', li).textContent = on ? ++n : ''; });
      $$('.sa-sec', f).forEach(s => { s.hidden = !$(`.sa-rank li[data-key="${s.dataset.track}"] input`, f).checked; });
      $$('.sa-if', f).forEach(s => { const r = $(`[name="${s.dataset.if}"]:checked`, f); s.hidden = !r || r.value !== 'yes'; });
      $$('.sa-other', f).forEach(s => { s.hidden = !$(`[name="${s.dataset.other}"][value=other]`, f).checked; });
      const v = $('[name=voice_kind]:checked', f);
      if (v) { $('.ldr-rec', f).hidden = v.value !== 'recording'; $('.ldr-yt', f).hidden = v.value !== 'youtube'; }
      count();
    }
    function count() {
      const f = $('.sa-form', body), el = f && $('.sa-count', f); if (!el) return;
      const links = (f.cr_links.value || '').split('\n').map(s => s.trim()).filter(Boolean).length;
      const files = (state.me && state.me.files || []).length, min = state.info.portfolio.minPieces;
      el.textContent = `${files + links} piece${files + links === 1 ? '' : 's'} so far (${files} uploaded, ${links} linked). At least ${min} needed.`;
    }

    // keep what's typed across a reload of the page data, and on this device until it's sent
    function snapshot() {
      const f = $('.sa-form', body); if (!f) return null;
      const out = {};
      $$('input[type=text], input[type=number], textarea, select', f).forEach(e => { if (e.name && e.name !== 'discord') out[e.name] = e.value; });
      $$('input[type=radio]:checked, input[type=checkbox]:checked', f).forEach(e => { out[e.name + '=' + e.value] = true; });
      out._rank = $$('.sa-rank li', f).map(li => li.dataset.key);
      return out;
    }
    function restore(s) {
      const f = $('.sa-form', body); if (!f || !s) return;
      $$('input[type=text], input[type=number], textarea, select', f).forEach(e => { if (s[e.name] !== undefined && e.name !== 'discord') e.value = s[e.name]; });
      $$('input[type=radio], input[type=checkbox]', f).forEach(e => { if (e.name) e.checked = !!s[e.name + '=' + e.value]; });
      const ol = $('.sa-rank', f);
      if (s._rank) s._rank.forEach(k => { const li = ol.querySelector(`[data-key="${k}"]`); if (li) ol.appendChild(li); });
      if (!$('[name=voice_kind]:checked', f)) $('[name=voice_kind][value=none]', f).checked = true;
      $$('.ldr-area textarea', f).forEach(t => { $('.ldr-count i', t.closest('.ldr-area')).textContent = t.value.length; });
      sync();
    }
    function keep() {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => { if (!state.me || !state.me.app || state.me.app.withdrawn) { const s = snapshot(); if (s) store.set(s); } }, 400);
    }
    async function reload() {
      const keepIt = snapshot();
      await load();
      restore(keepIt);
    }

    /* ------------------------------------------------------------ portfolio uploads */
    async function upload(input) {
      const files = [...input.files];
      input.value = '';
      const note = $('.sa-upnote', body), P = state.info.portfolio;
      for (let i = 0; i < files.length; i++) {
        if (!alive) return;
        note.textContent = `Uploading ${i + 1} of ${files.length}…`;
        const file = await shrink(files[i], P.maxFileBytes).catch(() => files[i]);
        if (file.size > P.maxFileBytes) { B.toast(`${files[i].name} is over ${Math.round(P.maxFileBytes / 1048576)} MB. Add it as a link instead.`); continue; }
        const r = await postRaw('/api/staff-apply/files', file, { 'Content-Type': file.type || 'application/octet-stream', 'X-Filename': encodeURIComponent(file.name) });
        if (!r.ok) { B.toast(r.data.error || 'The upload failed. Try again.'); break; }
      }
      note.textContent = '';
      await reload();
    }

    /* ------------------------------------------------------------ the voice note, recorded in the browser */
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
        if (s >= state.info.voiceNote.maxSeconds) mr.stop();
      }, 250);
    }
    async function recUpload(btn) {
      if (!recorder || !recorder.blob) return;
      if (recorder.seconds < state.info.voiceNote.minSeconds) { B.toast('Your voice note should be 1 to 2 minutes long.'); return; }
      btn.disabled = true; btn.textContent = 'Uploading…';
      const r = await postRaw('/api/staff-apply/recording', recorder.blob, { 'Content-Type': recorder.blob.type || 'audio/webm', 'X-Duration': String(Math.round(recorder.seconds)) });
      if (!alive) return;
      if (!r.ok) { btn.disabled = false; btn.textContent = 'Use this recording'; B.toast(r.data.error || 'The upload failed. Try again.'); return; }
      recorder = null;
      await reload();
      B.toast('Your voice note is saved.');
    }

    /* ------------------------------------------------------------ events */
    body.addEventListener('submit', async e => {
      e.preventDefault();
      const f = e.target;
      if (!f.classList.contains('sa-form')) return;
      const btn = $('button[type=submit]', f), label = btn.textContent;
      const fd = new FormData(f), g = k => fd.get(k) || '';
      const info = state.info;
      const payload = {
        mc_name: g('mc_name'), age: g('age'), timezone: g('timezone'), hours_weekdays: g('hours_weekdays'), hours_weekends: g('hours_weekends'),
        tracks: $$('.sa-rank li', f).filter(li => $('input', li).checked).map(li => li.dataset.key),
        staff_experience: g('staff_experience'), played_before: g('played_before'), played_detail: g('played_detail'), why: g('why'),
        combat_log: g('combat_log'), toxic_chat: g('toxic_chat'), punished: g('punished'), punished_detail: g('punished_detail'), agree: f.agree.checked,
        es_understand: g('es_understand'), es_understand_why: g('es_understand_why'), es_report: g('es_report'), es_hours: g('es_hours'),
        op_tools: Object.fromEntries(info.opTools.map(([k]) => [k, { rating: g(`op_tools.${k}.rating`), example: g(`op_tools.${k}.example`) }])),
        op_dupe: g('op_dupe'), op_shifts: fd.getAll('op_shifts').map(Number), op_shifts_text: g('op_shifts_text'), op_known: g('op_known'),
        voice_kind: g('voice_kind'), youtube_url: g('youtube_url'),
        cr_makes: fd.getAll('cr_makes'), cr_makes_other: g('cr_makes_other'), cr_tools: fd.getAll('cr_tools'), cr_tools_other: g('cr_tools_other'),
        cr_links: g('cr_links').split('\n').map(s => s.trim()).filter(Boolean), cr_hours: g('cr_hours'), cr_accept: g('cr_accept'),
      };
      if (payload.tracks.includes('operator') && payload.voice_kind === 'recording' && recorder && recorder.blob) return showErrors(f, { voice: 'Press "Use this recording" to save your voice note first, or choose "No voice note".' }, 'Save your voice note first.');
      btn.disabled = true; btn.textContent = 'Sending…';
      const r = await postJson('/api/staff-apply/submit', payload);
      if (!alive) return;
      btn.disabled = false; btn.textContent = label;
      if (!r.ok) return showErrors(f, r.data.fields, r.data.error || 'Something went wrong. Please try again.');
      store.clear();
      editing = false; state.me = r.data; draw();
      body.scrollIntoView({ block: 'start', behavior: 'smooth' });
      B.toast('Sent. Good luck!');
    });

    view.onclick = async e => {
      const go = e.target.closest('[data-go]'); if (go) { B.go(go.dataset.go); return; }
      const b = e.target.closest('[data-act]'); if (!b) return;
      const act = b.dataset.act;
      if (act === 'up' || act === 'down') {
        const li = b.closest('li'), ol = li.parentNode;
        if (act === 'up' && li.previousElementSibling) ol.insertBefore(li, li.previousElementSibling);
        if (act === 'down' && li.nextElementSibling) ol.insertBefore(li.nextElementSibling, li);
        b.focus(); sync(); keep(); return;
      }
      if (act === 'edit') { editing = true; draw(); $('.sa-step', body).scrollIntoView({ block: 'start', behavior: 'smooth' }); return; }
      if (act === 'cancel') { editing = false; draw(); return; }
      if (act === 'withdraw') {
        if (!confirm('Withdraw your staff application? You can apply again until applications close.')) return;
        b.disabled = true;
        const r = await postJson('/api/staff-apply/withdraw');
        if (!r.ok) { b.disabled = false; B.toast(r.data.error || 'Please try again.'); return; }
        state.me = r.data; editing = false; draw(); return;
      }
      if (act === 'rec-start') { recStart(); return; }
      if (act === 'rec-stop') { if (recorder && recorder.mr.state === 'recording') recorder.mr.stop(); return; }
      if (act === 'rec-again') { recorder = null; const u = recUi(); u.take.hidden = true; u.clock.textContent = '0:00'; return; }
      if (act === 'rec-upload') { recUpload(b); return; }
      if (act === 'rec-delete') {
        if (!confirm('Delete your saved voice note?')) return;
        const r = await postJson('/api/staff-apply/recording/delete');
        if (!r.ok) { B.toast(r.data.error || 'Please try again.'); return; }
        await reload(); return;
      }
      if (act === 'file-delete') {
        const r = await postJson(`/api/staff-apply/files/${+b.dataset.id}/delete`);
        if (!r.ok) { B.toast(r.data.error || 'Please try again.'); return; }
        await reload();
      }
    };

    load();
    return () => {
      alive = false;
      if (recorder && recorder.mr && recorder.mr.state === 'recording') recorder.mr.stop();
      if (location.pathname === '/staff-apply') history.replaceState(null, '', '/' + location.hash);
    };
  }
  B.registerView('staff-apply', { title: () => 'Join the staff', icon: 'shield', cls: 'nv-view', show: v => show(v) });
});

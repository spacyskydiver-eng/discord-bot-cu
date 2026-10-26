/* The Great War menu background: the in-game title screen's looping bunker video behind the page, and
   its bunker ambience behind a mute button. Paths come from server/site-media.config.js (window.CUE_MEDIA).
   - The poster (first frame) shows at once; the video loads after the page has rendered and fades in.
     Phones, Save-Data, 2g/3g connections and reduced motion keep the poster instead.
   - Sound is off until the visitor turns it on. The choice is remembered; on a later visit it resumes
     on their first click or key press, because browsers only allow sound after one.
   - The ambience loops without a gap: two players take turns, crossfading over the seam on the audio
     clock, so neither encoder padding nor timer jitter can open a silence.
   - Video and sound pause while the tab is hidden. */
(() => {
  'use strict';
  const M = window.CUE_MEDIA;
  const root = document.getElementById('cue-menubg');
  if (!M || !root) return;

  const KEY = 'cue:menuSound';
  const remember = v => { try { localStorage.setItem(KEY, v ? 'on' : 'off'); } catch (e) { /* storage blocked */ } };
  const remembered = () => { try { return localStorage.getItem(KEY) === 'on'; } catch (e) { return false; } };
  const mq = q => window.matchMedia && window.matchMedia(q).matches;
  const reducedMotion = () => mq('(prefers-reduced-motion: reduce)');

  /* ---------------------------------------------------------------- the video */
  function videoAllowed() {
    if (reducedMotion()) return false;
    if (mq('(max-width: 900px)') || mq('(pointer: coarse)')) return false;
    const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (c && (c.saveData || /^(slow-2g|2g|3g)$/.test(c.effectiveType || ''))) return false;
    return true;
  }
  let video = null;
  function loadVideo() {
    if (video || !videoAllowed()) return;
    video = document.createElement('video');
    video.className = 'mbg-video';
    Object.assign(video, { muted: true, loop: true, playsInline: true, autoplay: true, preload: 'auto' });
    video.setAttribute('muted', ''); video.setAttribute('playsinline', ''); video.setAttribute('aria-hidden', 'true');
    video.poster = M.menuPoster + '.jpg';
    video.innerHTML = `<source src="${M.menuVideo}.webm" type='video/webm; codecs="vp9"'><source src="${M.menuVideo}.mp4" type="video/mp4">`;
    video.addEventListener('playing', () => root.classList.add('is-playing'), { once: true });
    root.querySelector('.mbg-poster').after(video);
    if (!document.hidden) video.play().catch(() => {});
  }
  // after the page has rendered and gone quiet, so it never competes with the page itself
  const later = () => (window.requestIdleCallback ? requestIdleCallback(loadVideo, { timeout: 4000 }) : setTimeout(loadVideo, 1500));
  if (document.readyState === 'complete') later(); else window.addEventListener('load', later, { once: true });

  /* ---------------------------------------------------------------- the ambience */
  const XF = 1.5;                     // crossfade at the seam, seconds
  // MP3 first: every browser reports its length exactly, which the seamless handover depends on.
  // (Safari misreports this Ogg file's length by several seconds.) Ogg only if MP3 can't play.
  const audioSrc = (() => {
    const t = document.createElement('audio');
    return M.menuAudio + (t.canPlayType('audio/mpeg') ? '.mp3' : '.ogg');
  })();
  let ctx = null, master = null, players = [], cur = 0, timer = null, wanted = false, playing = false, xfading = false;

  function setup() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
    players = [0, 1].map(() => {
      const el = new Audio(); el.src = audioSrc; el.preload = 'auto'; el.crossOrigin = 'anonymous';
      const g = ctx.createGain(); g.gain.value = 0;
      ctx.createMediaElementSource(el).connect(g); g.connect(master);
      const p = { el, g };
      // safety net: if a player ever reaches its end before the handover, the other takes over at once
      el.addEventListener('ended', () => {
        if (!playing || players[cur] !== p || xfading) return;
        const b = players[1 - cur];
        b.g.gain.cancelScheduledValues(ctx.currentTime); b.g.gain.setValueAtTime(1, ctx.currentTime);
        b.el.currentTime = 0; b.el.play().catch(() => {});
        cur = 1 - cur;
      });
      return p;
    });
    return true;
  }
  function ramp(param, to, secs) {
    const t = ctx.currentTime;
    param.cancelScheduledValues(t);
    param.setValueAtTime(param.value, t);
    param.linearRampToValueAtTime(to, t + secs);
  }
  // hand over to the other player just before the end, crossfading on the audio clock
  function watch() {
    clearInterval(timer);
    timer = setInterval(() => {
      const a = players[cur], b = players[1 - cur];
      if (!playing || xfading || !a.el.duration || !isFinite(a.el.duration)) return;
      const left = a.el.duration - a.el.currentTime;
      // rewind the waiting player well before the seam: a seek right at the handover can stall playback
      if (left < XF + 8 && b.el.paused && b.el.currentTime !== 0 && !b.el.seeking) b.el.currentTime = 0;
      if (left > XF + 0.25) return;
      xfading = true;
      if (b.el.currentTime !== 0) b.el.currentTime = 0;
      b.el.play().then(() => {
        ramp(a.g.gain, 0, XF); ramp(b.g.gain, 1, XF);
        cur = 1 - cur;
        setTimeout(() => { a.el.pause(); xfading = false; }, XF * 1000 + 300);
      }).catch(() => { xfading = false; });
    }, 100);
  }
  async function soundOn() {
    if (!setup()) return;
    if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
    const a = players[cur];
    a.g.gain.cancelScheduledValues(ctx.currentTime); a.g.gain.setValueAtTime(1, ctx.currentTime);
    try { await a.el.play(); } catch (e) { return; }
    playing = true;
    ramp(master.gain, M.audioVolume, M.audioFadeSeconds);
    watch();
  }
  function soundOff(secs) {
    if (!ctx || !playing) return;
    playing = false;
    ramp(master.gain, 0, secs);
    clearInterval(timer);
    setTimeout(() => { if (!playing) players.forEach(p => p.el.pause()); }, secs * 1000 + 100);
  }

  /* ---------------------------------------------------------------- the button */
  const btn = document.getElementById('cue-sound');
  const ICON_ON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/></svg>';
  const ICON_OFF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="m22 9-6 6"/><path d="m16 9 6 6"/></svg>';
  function paint() {
    if (!btn) return;
    btn.innerHTML = wanted ? ICON_ON : ICON_OFF;
    btn.setAttribute('aria-pressed', String(wanted));
    btn.setAttribute('aria-label', wanted ? 'Turn the bunker sound off' : 'Turn the bunker sound on');
    btn.title = wanted ? 'Sound on' : 'Sound off';
    btn.classList.toggle('is-on', wanted);
  }
  if (btn) {
    btn.hidden = false;
    btn.addEventListener('click', e => {
      e.stopPropagation();
      wanted = !wanted;
      remember(wanted);
      paint();
      if (wanted) soundOn(); else soundOff(M.audioFadeSeconds);
    });
    paint();
  }
  // they had it on last time: resume on their first click or key press anywhere
  if (remembered()) {
    wanted = true; paint();
    const first = e => {
      if (btn && e.target && btn.contains(e.target)) return;   // the button handles itself
      removeEventListener('pointerdown', first, true); removeEventListener('keydown', first, true);
      if (wanted && !playing && !document.hidden) soundOn();
    };
    addEventListener('pointerdown', first, true);
    addEventListener('keydown', first, true);
  }

  /* ---------------------------------------------------------------- hidden tab */
  let resumeOnShow = false;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (video) video.pause();
      if (playing) { soundOff(0.3); resumeOnShow = true; }
    } else {
      if (video) video.play().catch(() => {});
      if (resumeOnShow && wanted) soundOn();
      resumeOnShow = false;
    }
  });
})();

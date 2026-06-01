// ── Particles ──
(function () {
  const canvas = document.getElementById('particles');
  if (!canvas) return;
  const ctx = canvas.getContext('2d', { alpha: true });
  let W, H, particles, rafId;
  let lastFrame = 0;
  const FPS = 38;
  const INTERVAL = 1000 / FPS;

  canvas.style.transform = 'translateZ(0)';

  function makeParticle() {
    const gold = Math.random() < 0.35;
    return {
      x: Math.random() * W,
      y: Math.random() * H,
      r: Math.random() * (gold ? 1.6 : 0.9) + 0.3,
      speed: Math.random() * 0.35 + 0.04,
      drift: (Math.random() - 0.5) * 0.18,
      alpha: Math.random() * 0.55 + 0.08,
      gold,
      twinkle: Math.random() * Math.PI * 2,
      twinkleSpeed: Math.random() * 0.04 + 0.01
    };
  }

  function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  function init() {
    resize();
    particles = Array.from({ length: 110 }, makeParticle);
    loop(0);
  }

  function loop(ts) {
    rafId = requestAnimationFrame(loop);
    if (ts - lastFrame < INTERVAL) return;
    lastFrame = ts;
    ctx.clearRect(0, 0, W, H);
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.y -= p.speed;
      p.x += p.drift;
      p.twinkle += p.twinkleSpeed;
      const alpha = p.alpha * (0.6 + 0.4 * Math.sin(p.twinkle));
      if (p.y < -5) { particles[i] = makeParticle(); particles[i].y = H + 5; continue; }
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.gold ? '#c9a84c' : 'rgba(180,180,230,0.7)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, 6.2832);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  let resizeTimer;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(resize, 200); });
  init();
})();

// ── Shooting stars ──
(function () {
  const canvas = document.getElementById('particles');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let W = window.innerWidth, H = window.innerHeight;
  window.addEventListener('resize', () => { W = window.innerWidth; H = window.innerHeight; });

  function shootingStar() {
    const angle = (Math.random() * 20 + 25) * Math.PI / 180;
    const startX = Math.random() * W * 0.75;
    const startY = Math.random() * H * 0.45;
    const len = Math.random() * 140 + 80;
    const tailLen = len * 0.85;
    const duration = Math.random() * 1800 + 1400;
    const start = performance.now();

    function draw(now) {
      const elapsed = now - start;
      const t = Math.min(elapsed / duration, 1);

      // tip moves forward, tail follows with offset
      const tipX = startX + Math.cos(angle) * len * t;
      const tipY = startY + Math.sin(angle) * len * t;
      const tailStart = Math.max(0, t - 0.45);
      const tailX = startX + Math.cos(angle) * len * tailStart;
      const tailY = startY + Math.sin(angle) * len * tailStart;

      // overall fade: in quickly, hold, fade out at end
      const globalAlpha = t < 0.15 ? t / 0.15 : t > 0.75 ? 1 - (t - 0.75) / 0.25 : 1;

      // trail gradient
      const grad = ctx.createLinearGradient(tailX, tailY, tipX, tipY);
      grad.addColorStop(0, `rgba(201,168,76,0)`);
      grad.addColorStop(0.6, `rgba(255,230,140,${0.45 * globalAlpha})`);
      grad.addColorStop(1, `rgba(255,255,255,0)`);

      ctx.save();
      ctx.globalAlpha = globalAlpha;
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.8;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(tailX, tailY);
      ctx.lineTo(tipX, tipY);
      ctx.stroke();

      // glowing tip
      const glow = ctx.createRadialGradient(tipX, tipY, 0, tipX, tipY, 7);
      glow.addColorStop(0, `rgba(255,245,200,${0.9 * globalAlpha})`);
      glow.addColorStop(0.3, `rgba(201,168,76,${0.4 * globalAlpha})`);
      glow.addColorStop(1, `rgba(201,168,76,0)`);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(tipX, tipY, 7, 0, Math.PI * 2);
      ctx.fill();

      // bright core dot
      ctx.fillStyle = `rgba(255,255,255,${0.95 * globalAlpha})`;
      ctx.beginPath();
      ctx.arc(tipX, tipY, 1.2, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();

      if (t < 1) requestAnimationFrame(draw);
    }

    requestAnimationFrame(draw);
  }

  setInterval(() => { if (Math.random() < 0.75) shootingStar(); }, 1400);
  setTimeout(shootingStar, 400);
  setTimeout(shootingStar, 1200);
  setTimeout(shootingStar, 2400);
})();

// ── Music notes canvas ──
(function () {
  const canvas = document.getElementById('musicNotesCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const CW = 140, CH = 200;
  canvas.width = CW;
  canvas.height = CH;
  const notes = [];
  const symbols = ['♪', '♫', '♩', '♬'];
  let active = false;

  function spawnNote() {
    if (!active) return;
    notes.push({
      x: CW / 2 + (Math.random() - 0.5) * 30,
      y: CH - 10,
      symbol: symbols[Math.floor(Math.random() * symbols.length)],
      alpha: 1,
      size: Math.random() * 12 + 20,
      vx: (Math.random() - 0.5) * 0.7,
      vy: -(Math.random() * 0.7 + 0.5)
    });
  }

  function loop() {
    ctx.clearRect(0, 0, CW, CH);
    for (let i = notes.length - 1; i >= 0; i--) {
      const n = notes[i];
      n.x += n.vx;
      n.y += n.vy;
      n.alpha -= 0.007;
      if (n.alpha <= 0) { notes.splice(i, 1); continue; }
      ctx.globalAlpha = n.alpha;
      ctx.font = `${n.size}px serif`;
      ctx.fillStyle = '#f0c94e';
      ctx.shadowColor = 'rgba(240,201,78,0.9)';
      ctx.shadowBlur = 12;
      ctx.fillText(n.symbol, n.x, n.y);
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    requestAnimationFrame(loop);
  }

  loop();
  setInterval(() => { if (active) spawnNote(); }, 500);

  window._musicNotesSetActive = (v) => { active = v; };
})();

// ── Hero video: click to enter + scroll fade + music button ──
(function () {
  const gate = document.getElementById('videoGate');
  const video = document.getElementById('heroBg');
  const musicWrap = document.getElementById('musicBtnWrap');
  const musicBtn = document.getElementById('musicBtn');
  if (!gate || !video) return;

  let userMuted = false;
  let scrollVolume = 1;

  function applyVolume() {
    video.volume = userMuted ? 0 : Math.max(scrollVolume * 0.85, 0.12);
    video.muted = userMuted;
  }

  gate.addEventListener('click', () => {
    video.volume = 1;
    video.play().then(() => {
      gate.classList.add('hidden');
      setTimeout(() => { gate.style.display = 'none'; }, 1300);
      if (musicWrap) { musicWrap.classList.add('visible'); }
      if (window._musicNotesSetActive) window._musicNotesSetActive(true);
    }).catch(() => {
      video.muted = true;
      userMuted = true;
      video.play();
      gate.classList.add('hidden');
      setTimeout(() => { gate.style.display = 'none'; }, 1300);
      if (musicWrap) { musicWrap.classList.add('visible'); }
      if (musicBtn) musicBtn.classList.add('muted');
    });
  });

  if (musicBtn) {
    musicBtn.addEventListener('click', () => {
      userMuted = !userMuted;
      musicBtn.classList.toggle('muted', userMuted);
      if (window._musicNotesSetActive) window._musicNotesSetActive(!userMuted);
      applyVolume();
    });
  }

  let scrollTicking = false;
  window.addEventListener('scroll', () => {
    if (scrollTicking) return;
    scrollTicking = true;
    requestAnimationFrame(() => {
      const heroH = window.innerHeight;
      const scrolled = window.scrollY;
      const progress = Math.min(Math.max((scrolled - heroH * 0.1) / (heroH * 0.7), 0), 1);
      video.style.opacity = 1 - progress;
      scrollVolume = 1 - progress;
      applyVolume();
      scrollTicking = false;
    });
  }, { passive: true });
})();

// ── Nav scroll style ──
(function () {
  const nav = document.getElementById('nav');
  if (!nav) return;
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(() => { nav.classList.toggle('scrolled', window.scrollY > 40); ticking = false; });
      ticking = true;
    }
  }, { passive: true });
})();

// ── Mobile nav ──
(function () {
  const burger = document.getElementById('navBurger');
  const links = document.querySelector('.nav-links');
  if (!burger || !links) return;
  let open = false;
  burger.addEventListener('click', () => {
    open = !open;
    links.style.cssText = open
      ? 'display:flex;flex-direction:column;position:fixed;top:68px;left:0;right:0;background:rgba(5,5,15,0.98);padding:1.5rem 2rem;gap:0.5rem;border-bottom:1px solid rgba(255,255,255,0.07);z-index:99'
      : '';
  });
})();

// ── Typewriter ──
(function () {
  const els = document.querySelectorAll('[data-typewriter]');
  els.forEach(el => {
    const text = el.dataset.typewriter;
    const speed = parseInt(el.dataset.speed) || 55;
    const delay = parseInt(el.dataset.delay) || 0;
    el.textContent = '';
    el.style.borderRight = '2px solid var(--gold)';
    el.style.paddingRight = '2px';
    let i = 0;
    function type() {
      if (i < text.length) {
        el.textContent += text[i++];
        setTimeout(type, speed + Math.random() * 30);
      } else {
        setTimeout(() => { el.style.borderRight = 'none'; }, 800);
      }
    }
    setTimeout(type, delay);
  });
})();

// ── Scroll reveal ──
(function () {
  const els = Array.from(document.querySelectorAll('.reveal'));
  if (!els.length) return;
  let delay = 0;
  let lastParent = null;
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      if (e.target.parentElement !== lastParent) { delay = 0; lastParent = e.target.parentElement; }
      const d = delay; delay += 70;
      setTimeout(() => e.target.classList.add('visible'), d);
      io.unobserve(e.target);
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -30px 0px' });
  els.forEach(el => io.observe(el));
})();

// ── Countdown timers ──
(function () {
  document.querySelectorAll('.countdown[data-target]').forEach(el => {
    const target = new Date(el.dataset.target).getTime();
    const dEl = el.querySelector('#cd-d'), hEl = el.querySelector('#cd-h');
    const mEl = el.querySelector('#cd-m'), sEl = el.querySelector('#cd-s');
    if (!dEl) return;
    function tick() {
      const diff = target - Date.now();
      if (diff <= 0) { dEl.textContent = hEl.textContent = mEl.textContent = sEl.textContent = '00'; return; }
      dEl.textContent = String(Math.floor(diff / 86400000)).padStart(2, '0');
      hEl.textContent = String(Math.floor((diff % 86400000) / 3600000)).padStart(2, '0');
      mEl.textContent = String(Math.floor((diff % 3600000) / 60000)).padStart(2, '0');
      sEl.textContent = String(Math.floor((diff % 60000) / 1000)).padStart(2, '0');
      setTimeout(tick, 1000);
    }
    tick();
  });
})();

// ── Hero mouse parallax ──
(function () {
  const hero = document.querySelector('.hero-content');
  if (!hero) return;
  document.addEventListener('mousemove', (e) => {
    const x = (e.clientX / window.innerWidth - 0.5) * 12;
    const y = (e.clientY / window.innerHeight - 0.5) * 8;
    hero.style.transform = `translate(${x}px, ${y}px)`;
  }, { passive: true });
})();

// ── Island card glow on hover ──
(function () {
  document.querySelectorAll('.island-card').forEach(card => {
    card.addEventListener('mousemove', (e) => {
      const r = card.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      card.style.background = `radial-gradient(circle at ${x}px ${y}px, rgba(201,168,76,0.08) 0%, var(--bg3) 60%)`;
    });
    card.addEventListener('mouseleave', () => { card.style.background = ''; });
  });
})();

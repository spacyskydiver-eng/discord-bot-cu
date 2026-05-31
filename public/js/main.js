// ── Particles (GPU-composited, frame-throttled) ──
(function () {
  const canvas = document.getElementById('particles');
  if (!canvas) return;
  const ctx = canvas.getContext('2d', { alpha: true });
  let W, H, particles, rafId;
  let lastFrame = 0;
  const FPS = 30;
  const INTERVAL = 1000 / FPS;

  // Force canvas onto its own GPU layer
  canvas.style.transform = 'translateZ(0)';

  function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  function makeParticle() {
    return {
      x: Math.random() * W,
      y: Math.random() * H,
      r: Math.random() * 1.0 + 0.3,
      speed: Math.random() * 0.25 + 0.05,
      drift: (Math.random() - 0.5) * 0.15,
      alpha: Math.random() * 0.45 + 0.1,
      gold: Math.random() < 0.25
    };
  }

  function init() {
    resize();
    particles = Array.from({ length: 55 }, makeParticle);
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
      if (p.y < -5) {
        particles[i] = makeParticle();
        particles[i].y = H + 5;
        continue;
      }
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.gold ? '#c9a84c' : 'rgba(180,180,220,0.6)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, 6.2832);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 200);
  });

  init();
})();

// ── Nav scroll style (passive listener) ──
(function () {
  const nav = document.getElementById('nav');
  if (!nav) return;
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(() => {
        nav.classList.toggle('scrolled', window.scrollY > 40);
        ticking = false;
      });
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

// ── Scroll reveal (simple, no DOM thrashing) ──
(function () {
  const els = Array.from(document.querySelectorAll('.reveal'));
  if (!els.length) return;
  let delay = 0;
  let lastParent = null;

  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      if (e.target.parentElement !== lastParent) { delay = 0; lastParent = e.target.parentElement; }
      const d = delay;
      delay += 70;
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
    const dEl = el.querySelector('#cd-d');
    const hEl = el.querySelector('#cd-h');
    const mEl = el.querySelector('#cd-m');
    const sEl = el.querySelector('#cd-s');
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

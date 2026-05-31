// ── Particles ──
(function () {
  const canvas = document.getElementById('particles');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let W, H, particles;

  function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  function Particle() {
    this.reset();
  }
  Particle.prototype.reset = function () {
    this.x = Math.random() * W;
    this.y = Math.random() * H;
    this.r = Math.random() * 1.2 + 0.3;
    this.speed = Math.random() * 0.3 + 0.05;
    this.angle = Math.random() * Math.PI * 2;
    this.alpha = Math.random() * 0.5 + 0.1;
    this.gold = Math.random() < 0.3;
  };
  Particle.prototype.update = function () {
    this.y -= this.speed;
    this.x += Math.sin(this.angle + Date.now() * 0.0003) * 0.2;
    if (this.y < -10) this.reset(), this.y = H + 10;
  };
  Particle.prototype.draw = function () {
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    ctx.fillStyle = this.gold
      ? `rgba(201,168,76,${this.alpha})`
      : `rgba(180,180,220,${this.alpha * 0.4})`;
    ctx.fill();
  };

  function init() {
    resize();
    particles = Array.from({ length: 120 }, () => new Particle());
    loop();
  }

  function loop() {
    ctx.clearRect(0, 0, W, H);
    particles.forEach(p => { p.update(); p.draw(); });
    requestAnimationFrame(loop);
  }

  window.addEventListener('resize', resize);
  init();
})();

// ── Nav scroll style ──
(function () {
  const nav = document.getElementById('nav');
  if (!nav) return;
  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 40);
  });
})();

// ── Mobile nav ──
(function () {
  const burger = document.getElementById('navBurger');
  const links = document.querySelector('.nav-links');
  if (!burger || !links) return;
  burger.addEventListener('click', () => {
    const open = links.style.display === 'flex';
    links.style.cssText = open
      ? ''
      : 'display:flex;flex-direction:column;position:fixed;top:68px;left:0;right:0;background:rgba(5,5,15,0.98);padding:1.5rem 2rem;gap:0.5rem;border-bottom:1px solid rgba(255,255,255,0.07);z-index:99';
  });
})();

// ── Scroll reveal ──
(function () {
  const els = document.querySelectorAll('.reveal');
  if (!els.length) return;
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e, i) => {
      if (e.isIntersecting) {
        // Stagger siblings
        const siblings = e.target.parentElement.querySelectorAll('.reveal:not(.visible)');
        let delay = 0;
        siblings.forEach(s => {
          if (s === e.target || s.getBoundingClientRect().top < window.innerHeight) {
            setTimeout(() => s.classList.add('visible'), delay);
            delay += 80;
          }
        });
        e.target.classList.add('visible');
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.12 });
  els.forEach(el => io.observe(el));
})();

// ── Countdown timers ──
(function () {
  const countdowns = document.querySelectorAll('.countdown[data-target]');
  countdowns.forEach(el => {
    const target = new Date(el.dataset.target).getTime();
    const dEl = el.querySelector('#cd-d');
    const hEl = el.querySelector('#cd-h');
    const mEl = el.querySelector('#cd-m');
    const sEl = el.querySelector('#cd-s');
    if (!dEl) return;

    function tick() {
      const diff = target - Date.now();
      if (diff <= 0) {
        dEl.textContent = hEl.textContent = mEl.textContent = sEl.textContent = '00';
        return;
      }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      dEl.textContent = String(d).padStart(2, '0');
      hEl.textContent = String(h).padStart(2, '0');
      mEl.textContent = String(m).padStart(2, '0');
      sEl.textContent = String(s).padStart(2, '0');
      setTimeout(tick, 1000);
    }
    tick();
  });
})();

// ── Glowing text pulse ──
(function () {
  const glows = document.querySelectorAll('.glow-text, .glow-gold');
  glows.forEach((el, i) => {
    el.style.animation = `glowPulse 3s ease-in-out ${i * 0.4}s infinite`;
  });
  if (!document.getElementById('glowStyle')) {
    const s = document.createElement('style');
    s.id = 'glowStyle';
    s.textContent = `
      @keyframes glowPulse {
        0%,100% { text-shadow: 0 0 30px rgba(201,168,76,0.5), 0 0 60px rgba(201,168,76,0.2); }
        50% { text-shadow: 0 0 50px rgba(201,168,76,0.9), 0 0 90px rgba(201,168,76,0.4), 0 0 120px rgba(201,168,76,0.15); }
      }
    `;
    document.head.appendChild(s);
  }
})();

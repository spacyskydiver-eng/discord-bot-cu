/* ==========================================================================
   CUE Effects Library — All 10 React Bits components ported to vanilla JS
   Applied globally to all public pages.
   ==========================================================================

   1. LatticeLoader  — grid-dot page-load overlay
   2. HoloCard       — 3-D tilt + holographic shine on cards / tiles
   3. ElectricBorder — animated lightning strands on card borders
   4. Radar          — rotating sweep-beam canvas decoration
   5. DitherVeil     — pixel-dither background overlay
   6. ElectricLogo   — electric arc sparks over the brand logotype
   7. WarmTooltip    — smooth spring tooltip on [data-tooltip] elements
   8. SpringCheck    — spring-bounce animated checkboxes
   9. BranchedMenu   — collapsible tree navigation with SVG branch lines
  10. FolderFloat    — 3-D folder that opens and spills floating items
   ========================================================================== */

(function () {
  'use strict';

  /* ─────────────────────────────────────────────────────────────────────────
     SHARED HELPERS
     ───────────────────────────────────────────────────────────────────────── */
  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function hexToRgb(hex) {
    const n = parseInt(hex.replace('#', ''), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }


  /* ─────────────────────────────────────────────────────────────────────────
     1. LATTICE LOADER
     Adapted from LatticeLoader.rtf — orbit pattern, 3×3 grid of dots.
     Auto-inserted as a page-load overlay; fades out after window.load.
     ───────────────────────────────────────────────────────────────────────── */
  function initLatticeLoader() {
    const overlay = document.createElement('div');
    overlay.id = 'cue-loader';
    overlay.setAttribute('aria-hidden', 'true');

    const grid = document.createElement('div');
    grid.className = 'cue-loader-grid';
    for (let i = 0; i < 9; i++) {
      const cell = document.createElement('div');
      cell.className = 'cue-loader-cell';
      cell.dataset.i = i;
      grid.appendChild(cell);
    }
    overlay.appendChild(grid);
    document.body.appendChild(overlay);

    // Orbit: go clockwise around the perimeter, centre = null
    const orbit = [0, 1, 2, 5, 8, 7, 6, 3];
    let step = 0;
    const cells = grid.querySelectorAll('.cue-loader-cell');

    const tick = setInterval(() => {
      cells.forEach(c => c.removeAttribute('data-on'));
      cells[orbit[step % orbit.length]].setAttribute('data-on', '');
      step++;
    }, 110);

    const dismiss = () => {
      clearInterval(tick);
      overlay.style.opacity = '0';
      overlay.style.transition = 'opacity .4s';
      setTimeout(() => overlay.remove(), 420);
    };

    if (document.readyState === 'complete') {
      setTimeout(dismiss, 200);
    } else {
      window.addEventListener('load', () => setTimeout(dismiss, 200), { once: true });
    }
  }


  /* ─────────────────────────────────────────────────────────────────────────
     2. HOLO CARD
     Adapted from HoloCard.rtf — 3-D perspective tilt + rainbow shine overlay.
     Auto-applied to every .holo-card and .card element on the page.
     ───────────────────────────────────────────────────────────────────────── */
  function initHoloCards() {
    const TILT = 12, PERSP = 900;

    document.querySelectorAll('.holo-card, .card, .rank, .efeat').forEach(card => {
      if (card.dataset.holoInit) return;
      card.dataset.holoInit = '1';

      let shine = card.querySelector('.holo-shine');
      if (!shine) {
        shine = document.createElement('span');
        shine.className = 'holo-shine';
        card.appendChild(shine);
      }

      card.style.transformStyle = 'preserve-3d';

      card.addEventListener('mousemove', e => {
        const r = card.getBoundingClientRect();
        const x = e.clientX - r.left, y = e.clientY - r.top;
        const cx = r.width / 2, cy = r.height / 2;
        const rx = ((y - cy) / cy) * -TILT;
        const ry = ((x - cx) / cx) * TILT;
        const px = (x / r.width * 100).toFixed(1);
        const py = (y / r.height * 100).toFixed(1);

        card.style.transform =
          `perspective(${PERSP}px) rotateX(${rx}deg) rotateY(${ry}deg) translateZ(6px)`;
        card.style.boxShadow =
          '0 28px 60px rgba(0,0,0,.7), 0 0 0 1px rgba(255,255,255,.1)';

        // Rainbow hue shifts with tilt angle
        const hue = ((ry * 3) + 180) % 360;
        shine.style.opacity = '1';
        shine.style.background = [
          `radial-gradient(circle at ${px}% ${py}%, rgba(255,255,255,.22) 0%, transparent 55%)`,
          `linear-gradient(${hue}deg,
            rgba(77,171,247,.09) 0%,
            rgba(168,85,247,.09) 40%,
            rgba(255,107,107,.07) 80%)`
        ].join(', ');
      });

      card.addEventListener('mouseleave', () => {
        card.style.transform = '';
        card.style.boxShadow = '';
        shine.style.opacity = '0';
      });
    });
  }


  /* ─────────────────────────────────────────────────────────────────────────
     3. ELECTRIC BORDER
     Adapted from ElectricBorder.rtf — animated lightning strands trace the
     perimeter of a rounded-rectangle element using canvas 2D.
     Usage: new CUE.ElectricBorder(element)
     ───────────────────────────────────────────────────────────────────────── */
  class ElectricBorder {
    constructor(el, opts = {}) {
      this.el = el;
      this.c1 = opts.color1 || '#4dabf7';
      this.c2 = opts.color2 || '#a855f7';

      const s = el.style;
      if (!s.position || s.position === 'static') s.position = 'relative';

      this._canvas = document.createElement('canvas');
      this._canvas.style.cssText =
        'position:absolute;inset:0;pointer-events:none;z-index:0;border-radius:inherit;width:100%;height:100%';
      el.insertBefore(this._canvas, el.firstChild);

      this._t = 0;
      this._raf = 0;
      this._resize();
      this._ro = new ResizeObserver(() => this._resize());
      this._ro.observe(el);
      this._loop();
    }

    _resize() {
      const r = this.el.getBoundingClientRect();
      this._canvas.width = r.width;
      this._canvas.height = r.height;
    }

    // Map a perimeter distance (0..1) to an {x,y} point on a rounded rect
    _point(frac, w, h, R) {
      const straight = 2 * (w - 2 * R) + 2 * (h - 2 * R);
      const corners = 2 * Math.PI * R;
      const P = straight + corners;
      let d = ((frac % 1) + 1) % 1 * P;

      const seg = [
        w - 2 * R,           // top edge
        Math.PI / 2 * R,     // top-right corner
        h - 2 * R,           // right edge
        Math.PI / 2 * R,     // bottom-right corner
        w - 2 * R,           // bottom edge
        Math.PI / 2 * R,     // bottom-left corner
        h - 2 * R,           // left edge
        Math.PI / 2 * R      // top-left corner
      ];

      for (let i = 0; i < seg.length; i++) {
        if (d <= seg[i]) {
          const t = d / seg[i];
          switch (i) {
            case 0: return { x: R + t * (w - 2 * R), y: 0 };
            case 1: { const a = -Math.PI / 2 + t * Math.PI / 2; return { x: w - R + Math.cos(a) * R, y: R + Math.sin(a) * R }; }
            case 2: return { x: w, y: R + t * (h - 2 * R) };
            case 3: { const a = t * Math.PI / 2; return { x: w - R + Math.cos(a) * R, y: h - R + Math.sin(a) * R }; }
            case 4: return { x: w - R - t * (w - 2 * R), y: h };
            case 5: { const a = Math.PI / 2 + t * Math.PI / 2; return { x: R + Math.cos(a) * R, y: h - R + Math.sin(a) * R }; }
            case 6: return { x: 0, y: h - R - t * (h - 2 * R) };
            case 7: { const a = Math.PI + t * Math.PI / 2; return { x: R + Math.cos(a) * R, y: R + Math.sin(a) * R }; }
          }
        }
        d -= seg[i];
      }
      return { x: R, y: 0 };
    }

    _loop() {
      const ctx = this._canvas.getContext('2d');
      const draw = () => {
        const w = this._canvas.width, h = this._canvas.height;
        if (!w || !h) { this._raf = requestAnimationFrame(draw); return; }
        ctx.clearRect(0, 0, w, h);
        const R = 16;
        const t = this._t;

        for (let arc = 0; arc < 3; arc++) {
          const speed = 0.18 + arc * 0.06;
          const start = ((t * speed + arc * 0.33) % 1 + 1) % 1;
          const length = 0.12 + 0.06 * Math.sin(t * 1.5 + arc);
          const STEPS = 50;
          const color = arc % 2 === 0 ? this.c1 : this.c2;
          const alpha = 0.55 + 0.35 * Math.sin(t * 2.5 + arc * 1.3);

          ctx.beginPath();
          for (let s = 0; s <= STEPS; s++) {
            const frac = start + (s / STEPS) * length;
            const pt = this._point(frac, w, h, R);
            const next = this._point(frac + 0.001, w, h, R);

            // Perpendicular jitter for electric waviness
            const nx = -(next.y - pt.y);
            const ny = next.x - pt.x;
            const nl = Math.sqrt(nx * nx + ny * ny) || 1;
            const envelope = Math.sin(s / STEPS * Math.PI);
            const jitter = 3 * Math.sin(t * 9 + s * 0.7 + arc * 2.1) * envelope;

            const px = pt.x + (nx / nl) * jitter;
            const py = pt.y + (ny / nl) * jitter;
            if (s === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          }

          ctx.strokeStyle = color;
          ctx.lineWidth = 1.5;
          ctx.globalAlpha = alpha * 0.7;
          ctx.stroke();

          // Glow pass
          ctx.shadowBlur = 10;
          ctx.shadowColor = color;
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.shadowBlur = 0;
          ctx.globalAlpha = 1;
        }

        this._t += 0.022;
        this._raf = requestAnimationFrame(draw);
      };
      this._raf = requestAnimationFrame(draw);
    }

    destroy() {
      cancelAnimationFrame(this._raf);
      this._ro.disconnect();
      this._canvas.remove();
    }
  }


  /* ─────────────────────────────────────────────────────────────────────────
     4. RADAR
     Adapted from Radar.rtf — perspective top-down radar with sweep beam,
     rings, spokes and blip detections.
     Usage: new CUE.Radar(containerElement, { size, accent })
     ───────────────────────────────────────────────────────────────────────── */
  class Radar {
    constructor(el, opts = {}) {
      this.el = el;
      this.accent = opts.accent || '#4dabf7';
      this.size = opts.size || 220;
      this.rings = opts.rings || 4;

      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = this.size;
      canvas.style.cssText = 'display:block;';
      el.appendChild(canvas);
      this._canvas = canvas;
      this._sweep = 0;

      // Seed random blips
      this._blips = Array.from({ length: 7 }, (_, i) => ({
        a: Math.random() * Math.PI * 2,
        d: 0.25 + Math.random() * 0.65,
        age: Math.floor(Math.random() * 120),
        life: 150 + Math.floor(Math.random() * 80)
      }));

      this._loop();
    }

    _loop() {
      const ctx = this._canvas.getContext('2d');
      const sz = this.size;
      const cx = sz / 2, cy = sz / 2, cr = sz / 2 - 4;
      const acc = this.accent;
      const [ar, ag, ab] = hexToRgb(acc);

      const frame = () => {
        ctx.clearRect(0, 0, sz, sz);

        // Background disc
        ctx.beginPath();
        ctx.arc(cx, cy, cr, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(6,8,14,.92)';
        ctx.fill();

        // Rings
        for (let i = 1; i <= this.rings; i++) {
          ctx.beginPath();
          ctx.arc(cx, cy, cr * (i / this.rings), 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(${ar},${ag},${ab},.18)`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        // Spokes (8 directions)
        for (let i = 0; i < 8; i++) {
          const a = i * Math.PI / 4;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + Math.cos(a) * cr, cy + Math.sin(a) * cr);
          ctx.strokeStyle = `rgba(${ar},${ag},${ab},.10)`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        // Sweep trail
        const trailSteps = 32;
        const trailArc = Math.PI * 0.55;
        for (let i = 0; i < trailSteps; i++) {
          const a0 = this._sweep - trailArc * ((i + 1) / trailSteps);
          const a1 = this._sweep - trailArc * (i / trailSteps);
          const alpha = ((trailSteps - i) / trailSteps) * 0.32;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.arc(cx, cy, cr, a0, a1);
          ctx.closePath();
          ctx.fillStyle = `rgba(${ar},${ag},${ab},${alpha})`;
          ctx.fill();
        }

        // Sweep line
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(this._sweep) * cr, cy + Math.sin(this._sweep) * cr);
        ctx.strokeStyle = acc;
        ctx.lineWidth = 2;
        ctx.shadowBlur = 8;
        ctx.shadowColor = acc;
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Blips
        this._blips.forEach(b => {
          const diff = ((this._sweep - b.a) + Math.PI * 4) % (Math.PI * 2);
          if (diff < 0.08) b.age = 0;

          const alpha = clamp(1 - b.age / b.life, 0, 1);
          if (alpha > 0.02) {
            const bx = cx + Math.cos(b.a) * (cr * b.d);
            const by = cy + Math.sin(b.a) * (cr * b.d);
            ctx.beginPath();
            ctx.arc(bx, by, 3.5, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${ar},${ag},${ab},${alpha})`;
            ctx.shadowBlur = 10;
            ctx.shadowColor = acc;
            ctx.fill();
            ctx.shadowBlur = 0;
          }

          b.age++;
          if (b.age > b.life * 2) {
            b.a = Math.random() * Math.PI * 2;
            b.d = 0.25 + Math.random() * 0.65;
            b.age = 0;
            b.life = 150 + Math.floor(Math.random() * 80);
          }
        });

        // Outer ring highlight
        ctx.beginPath();
        ctx.arc(cx, cy, cr, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${ar},${ag},${ab},.4)`;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Centre dot
        ctx.beginPath();
        ctx.arc(cx, cy, 3, 0, Math.PI * 2);
        ctx.fillStyle = acc;
        ctx.fill();

        this._sweep = (this._sweep + 0.022) % (Math.PI * 2);
        this._raf = requestAnimationFrame(frame);
      };
      this._raf = requestAnimationFrame(frame);
    }

    destroy() { cancelAnimationFrame(this._raf); }
  }


  /* ─────────────────────────────────────────────────────────────────────────
     5. DITHER VEIL
     Adapted from DitherVeil.rtf — ordered Bayer-matrix pixel-dither on a
     dark gradient; rendered once to a fixed full-screen canvas.
     Usage: new CUE.DitherVeil()  — auto-inserts itself into <body>
     ───────────────────────────────────────────────────────────────────────── */
  class DitherVeil {
    constructor(opts = {}) {
      this._scale = opts.scale || 3;
      const canvas = document.createElement('canvas');
      canvas.id = 'cue-dither-canvas';
      canvas.setAttribute('aria-hidden', 'true');
      canvas.style.cssText =
        'position:fixed;inset:0;pointer-events:none;z-index:0;image-rendering:pixelated;';
      document.body.insertBefore(canvas, document.body.firstChild);
      this._canvas = canvas;
      this._render();
      window.addEventListener('resize', () => this._render());
    }

    _render() {
      const scale = this._scale;
      const cw = Math.ceil(window.innerWidth / scale);
      const ch = Math.ceil(window.innerHeight / scale);
      this._canvas.width = cw;
      this._canvas.height = ch;
      this._canvas.style.width = window.innerWidth + 'px';
      this._canvas.style.height = window.innerHeight + 'px';

      const ctx = this._canvas.getContext('2d');
      const img = ctx.createImageData(cw, ch);
      const d = img.data;

      // 4×4 Bayer ordered dither matrix (normalised 0..15)
      const B = [
         0,  8,  2, 10,
        12,  4, 14,  6,
         3, 11,  1,  9,
        15,  7, 13,  5
      ];

      for (let y = 0; y < ch; y++) {
        for (let x = 0; x < cw; x++) {
          const nx = x / cw, ny = y / ch;
          const idx = (y * cw + x) * 4;
          const thr = B[(y & 3) * 4 + (x & 3)] / 15;

          // Dark blue-to-indigo gradient base
          const baseR = 8  + 14 * nx * (1 - ny);
          const baseG = 9  + 10 * nx * ny;
          const baseB = 18 + 24 * ny;

          const bump = thr * 22;

          d[idx    ] = Math.min(255, baseR + bump * 0.35) | 0;
          d[idx + 1] = Math.min(255, baseG + bump * 0.25) | 0;
          d[idx + 2] = Math.min(255, baseB + bump * 0.55) | 0;
          d[idx + 3] = 210;
        }
      }

      ctx.putImageData(img, 0, 0);
    }
  }


  /* ─────────────────────────────────────────────────────────────────────────
     6. ELECTRIC LOGO
     Adapted from ElectricLogo.rtf — animated electric arc sparks layered
     over a text element using a canvas overlay.
     Usage: new CUE.ElectricLogo(element)
     ───────────────────────────────────────────────────────────────────────── */
  class ElectricLogo {
    constructor(el) {
      this.el = el;
      if (!el.style.position || el.style.position === 'static') el.style.position = 'relative';

      this._canvas = document.createElement('canvas');
      this._canvas.style.cssText =
        'position:absolute;inset:0;pointer-events:none;z-index:10;border-radius:inherit;';
      el.appendChild(this._canvas);
      this._t = 0;
      this._sparks = [];
      this._resize();
      this._ro = new ResizeObserver(() => this._resize());
      this._ro.observe(el);
      this._loop();
    }

    _resize() {
      const r = this.el.getBoundingClientRect();
      this._canvas.width = Math.max(1, r.width);
      this._canvas.height = Math.max(1, r.height);
    }

    _spawn() {
      const W = this._canvas.width;
      const x = 10 + Math.random() * (W - 20);
      this._sparks.push({
        x0: x, y0: this._canvas.height * 0.6,
        x1: x + (Math.random() - 0.5) * 40,
        y1: this._canvas.height * 0.2 + Math.random() * this._canvas.height * 0.2,
        age: 0,
        life: 8 + Math.floor(Math.random() * 8),
        color: Math.random() > 0.5 ? '#4dabf7' : '#a855f7',
        jitterSeed: Math.random() * 100
      });
    }

    _loop() {
      const ctx = this._canvas.getContext('2d');

      const frame = () => {
        const W = this._canvas.width, H = this._canvas.height;
        ctx.clearRect(0, 0, W, H);

        // Spawn new sparks occasionally
        if (Math.random() < 0.12) this._spawn();

        this._sparks = this._sparks.filter(s => s.age < s.life);
        this._sparks.forEach(s => {
          const prog = s.age / s.life;
          const alpha = (1 - prog) * 0.85;

          // 3-point jagged bolt
          const mx = lerp(s.x0, s.x1, 0.5) + 6 * Math.sin(s.jitterSeed + this._t * 8);
          const my = lerp(s.y0, s.y1, 0.5);

          ctx.beginPath();
          ctx.moveTo(s.x0, s.y0);
          ctx.lineTo(mx, my);
          ctx.lineTo(s.x1, s.y1);
          ctx.strokeStyle = s.color;
          ctx.lineWidth = 1 + 0.5 * (1 - prog);
          ctx.globalAlpha = alpha;
          ctx.shadowBlur = 6;
          ctx.shadowColor = s.color;
          ctx.stroke();
          ctx.shadowBlur = 0;
          ctx.globalAlpha = 1;

          s.age++;
        });

        this._t += 0.016;
        this._raf = requestAnimationFrame(frame);
      };
      this._raf = requestAnimationFrame(frame);
    }

    destroy() {
      cancelAnimationFrame(this._raf);
      this._ro.disconnect();
      this._canvas.remove();
    }
  }


  /* ─────────────────────────────────────────────────────────────────────────
     7. WARM TOOLTIP
     Adapted from WarmTooltip.rtf — spring-scale tooltip for any element
     with a [data-tooltip] attribute.
     ───────────────────────────────────────────────────────────────────────── */
  function initWarmTooltips() {
    let tip = null;

    function getOrCreateTip() {
      if (!tip) {
        tip = document.createElement('div');
        tip.className = 'cue-tooltip';
        tip.setAttribute('aria-hidden', 'true');
        document.body.appendChild(tip);
      }
      return tip;
    }

    document.querySelectorAll('[data-tooltip]').forEach(el => {
      if (el.dataset.tooltipInit) return;
      el.dataset.tooltipInit = '1';

      el.addEventListener('mouseenter', () => {
        const text = el.dataset.tooltip;
        if (!text) return;

        const t = getOrCreateTip();
        t.textContent = text;
        t.style.display = 'block';
        t.style.opacity = '0';
        t.style.transform = 'translateY(6px) scale(0.9)';
        t.style.transition = 'none';

        // Position
        const er = el.getBoundingClientRect();
        const tr = t.getBoundingClientRect();
        const left = clamp(er.left + er.width / 2 - tr.width / 2, 8, window.innerWidth - tr.width - 8);
        t.style.left = left + 'px';
        t.style.top  = (er.top - tr.height - 10 + window.scrollY) + 'px';

        requestAnimationFrame(() => {
          t.style.transition = 'opacity .18s, transform .24s cubic-bezier(.23,1,.32,1)';
          t.style.opacity = '1';
          t.style.transform = 'translateY(0) scale(1)';
        });
      });

      el.addEventListener('mouseleave', () => {
        if (!tip) return;
        tip.style.opacity = '0';
        tip.style.transform = 'translateY(4px) scale(0.95)';
        setTimeout(() => { if (tip) tip.style.display = 'none'; }, 220);
      });
    });
  }


  /* ─────────────────────────────────────────────────────────────────────────
     8. SPRING CHECK
     Adapted from SpringCheck.rtf — spring-bounce animated checkbox.
     Auto-applied to any <input type="checkbox" class="spring-check">.
     ───────────────────────────────────────────────────────────────────────── */
  function initSpringChecks() {
    document.querySelectorAll('input[type="checkbox"].spring-check').forEach(input => {
      if (input.dataset.scInit) return;
      input.dataset.scInit = '1';

      const wrap = document.createElement('label');
      wrap.className = 'cue-spring-check-wrap';

      const box = document.createElement('span');
      box.className = 'cue-sc-box';
      box.innerHTML =
        `<span class="cue-sc-fill"></span>
         <svg class="cue-sc-tick" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
           <path d="M5 13l4 4L19 7"/>
         </svg>`;

      input.parentNode.insertBefore(wrap, input);
      wrap.appendChild(input);
      wrap.appendChild(box);

      const update = () => {
        box.classList.toggle('checked', input.checked);
      };
      input.addEventListener('change', update);
      update();
    });
  }


  /* ─────────────────────────────────────────────────────────────────────────
     9. BRANCHED MENU
     Adapted from BranchedMenu.rtf — collapsible tree navigation with
     animated SVG connector lines.
     Usage: new CUE.BranchedMenu(containerEl, items, opts)
       items: [{ label, children: [{ label, value, href }] }]
     ───────────────────────────────────────────────────────────────────────── */
  class BranchedMenu {
    constructor(el, items, opts = {}) {
      this.el = el;
      this.items = items;
      this.opts = opts;
      this._open = new Set([0]);
      this._active = items[0]?.children?.[0]?.value || '';
      this._render();
    }

    _render() {
      const el = this.el;
      el.className = 'cue-branched-menu';
      el.innerHTML = '';

      this.items.forEach((section, si) => {
        const isOpen = this._open.has(si);

        // Section header
        const head = document.createElement('button');
        head.className = 'cbm-head' + (isOpen ? ' open' : '');
        head.type = 'button';
        head.innerHTML =
          `<span class="cbm-label">${section.label}</span>
           <span class="cbm-chev">${isOpen ? '▾' : '›'}</span>`;
        head.addEventListener('click', () => {
          if (this._open.has(si)) this._open.delete(si);
          else this._open.add(si);
          this._render();
        });
        el.appendChild(head);

        if (isOpen && section.children?.length) {
          // SVG trunk + branches
          const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          svg.style.cssText = 'position:absolute;left:16px;pointer-events:none';
          svg.setAttribute('width', '20');
          svg.setAttribute('height', section.children.length * 36 + 'px');

          const trunk = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          trunk.setAttribute('x1', 7); trunk.setAttribute('y1', 0);
          trunk.setAttribute('x2', 7); trunk.setAttribute('y2', section.children.length * 36);
          trunk.setAttribute('stroke', '#2a2c34'); trunk.setAttribute('stroke-width', '1.5');
          svg.appendChild(trunk);

          section.children.forEach((_, i) => {
            const branch = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            const y = i * 36 + 18;
            branch.setAttribute('d', `M7,${y} Q7,${y} 16,${y}`);
            branch.setAttribute('stroke', '#2a2c34'); branch.setAttribute('stroke-width', '1.5'); branch.setAttribute('fill', 'none');
            svg.appendChild(branch);
          });

          const list = document.createElement('div');
          list.className = 'cbm-children';
          list.style.position = 'relative';
          list.appendChild(svg);

          section.children.forEach(child => {
            const item = document.createElement('a');
            item.className = 'cbm-item' + (this._active === child.value ? ' active' : '');
            item.href = child.href || '#';
            if (!child.href || child.href === '#') item.setAttribute('role', 'button');
            item.textContent = child.label;
            item.addEventListener('click', e => {
              if (!child.href || child.href === '#') e.preventDefault();
              this._active = child.value;
              this.opts.onSelect?.(child.value, child);
              this._render();
            });
            list.appendChild(item);
          });

          el.appendChild(list);
        }
      });
    }
  }


  /* ─────────────────────────────────────────────────────────────────────────
     10. FOLDER FLOAT
     Adapted from FolderFloat.rtf — 3-D folder that opens to reveal
     floating pill items with staggered animation.
     Usage: new CUE.FolderFloat(containerEl, items, opts)
       items: string[] | { label, value, href? }[]
     ───────────────────────────────────────────────────────────────────────── */
  class FolderFloat {
    constructor(el, items, opts = {}) {
      this.el = el;
      this.opts = opts;
      this._items = items.map(it =>
        typeof it === 'string' ? { label: it, value: it } : it
      );
      this._open = opts.defaultOpen || false;
      el.className = 'cue-folder-float' + (this._open ? ' open' : '');
      this._render();
    }

    _render() {
      const el = this.el;
      el.innerHTML = '';

      const folder = document.createElement('div');
      folder.className = 'cff-folder';
      folder.innerHTML =
        `<div class="cff-tab"></div>
         <div class="cff-body">
           <svg class="cff-icon" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
             <path d="M20 7H12L10.6 5.6A2 2 0 0 0 9.2 5H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z"/>
           </svg>
           <span class="cff-label">${this.opts.label || 'Links'}</span>
           <span class="cff-sub">${this._items.length} items</span>
         </div>`;

      folder.addEventListener('click', () => {
        this._open = !this._open;
        el.classList.toggle('open', this._open);
      });
      el.appendChild(folder);

      const pills = document.createElement('div');
      pills.className = 'cff-pills';
      this._items.forEach((item, i) => {
        const pill = document.createElement('a');
        pill.className = 'cff-pill';
        pill.style.setProperty('--i', i);
        pill.textContent = item.label;
        pill.href = item.href || '#';
        if (!item.href) {
          pill.addEventListener('click', e => {
            e.preventDefault();
            this.opts.onSelect?.(item.value, item);
            this._open = false;
            el.classList.remove('open');
          });
        }
        pills.appendChild(pill);
      });
      el.appendChild(pills);
    }
  }


  /* ─────────────────────────────────────────────────────────────────────────
     AUTO-INIT
     Runs once on DOMContentLoaded. Applies effects based on CSS classes
     and data-* attributes present in the page.
     ───────────────────────────────────────────────────────────────────────── */
  function autoInit() {
    // 1. Lattice Loader — on every page (unless data-no-loader present)
    if (!document.querySelector('[data-no-loader]') && !document.getElementById('cue-loader')) {
      initLatticeLoader();
    }

    // 5. Dither Veil — on pages with <div id="cue-dither"> or the home page
    if (document.querySelector('[data-dither-veil]') && !document.getElementById('cue-dither-canvas')) {
      new DitherVeil({ scale: 3 });
    }

    // 2. Holo Cards — all .holo-card, .card, .rank, .efeat
    initHoloCards();

    // 3. Electric Border — elements with [data-eb]
    document.querySelectorAll('[data-eb]').forEach(el => {
      if (!el._ebInstance) el._ebInstance = new ElectricBorder(el);
    });

    // 4. Radar — elements with [data-radar]
    document.querySelectorAll('[data-radar]').forEach(el => {
      if (!el._radarInstance) {
        el._radarInstance = new Radar(el, {
          size:   parseInt(el.dataset.radarSize)   || 220,
          accent: el.dataset.radarAccent           || '#4dabf7',
          rings:  parseInt(el.dataset.radarRings)  || 4
        });
      }
    });

    // 6. Electric Logo — elements with [data-electric-logo]
    document.querySelectorAll('[data-electric-logo]').forEach(el => {
      if (!el._elInstance) el._elInstance = new ElectricLogo(el);
    });

    // 7. Warm Tooltip — all [data-tooltip]
    initWarmTooltips();

    // 8. Spring Check — all input[type=checkbox].spring-check
    initSpringChecks();

    // 9. Branched Menu — [data-branched-menu='[…]']
    document.querySelectorAll('[data-branched-menu]').forEach(el => {
      if (el._bmInstance) return;
      try {
        const items = JSON.parse(el.dataset.branchedMenu);
        el._bmInstance = new BranchedMenu(el, items, {
          onSelect: (val, item) => {
            if (item.href && item.href !== '#') window.location.href = item.href;
          }
        });
      } catch (_) {}
    });

    // 10. Folder Float — [data-folder-float='[…]']
    document.querySelectorAll('[data-folder-float]').forEach(el => {
      if (el._ffInstance) return;
      try {
        const items = JSON.parse(el.dataset.folderFloat);
        el._ffInstance = new FolderFloat(el, items, {
          label:       el.dataset.folderLabel || 'Links',
          defaultOpen: el.dataset.folderOpen  === 'true'
        });
      } catch (_) {}
    });
  }

  /* Export public API */
  window.CUE = {
    ElectricBorder,
    Radar,
    DitherVeil,
    ElectricLogo,
    BranchedMenu,
    FolderFloat,
    initHoloCards,
    initWarmTooltips,
    initSpringChecks
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoInit);
  } else {
    autoInit();
  }
})();

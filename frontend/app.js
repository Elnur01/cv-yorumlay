/* ─────────────────────────────────────────────
   CV YORUMLAYICISI — APP LOGIC
   ───────────────────────────────────────────── */

// ── SVG GRADIENT DEFS (injected into ring SVG) ──────────────────────────
(function injectSvgDefs() {
  const svg = document.querySelector('.score-ring');
  if (!svg) return;
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  defs.innerHTML = `
    <linearGradient id="ring-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%"   stop-color="#8338EC"/>
      <stop offset="100%" stop-color="#FF006E"/>
    </linearGradient>
  `;
  svg.prepend(defs);
})();

// ── CANVAS PARTICLES ────────────────────────────────────────────────────
(function initCanvas() {
  const canvas = document.getElementById('bg-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let W, H, particles = [];

  const COLORS = ['rgba(131,56,236,', 'rgba(255,0,110,', 'rgba(251,86,7,'];

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  function mkParticle() {
    return {
      x: Math.random() * W,
      y: Math.random() * H,
      r: Math.random() * 2.2 + 0.4,
      vx: (Math.random() - .5) * .3,
      vy: (Math.random() - .5) * .3,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      alpha: Math.random() * .18 + .05,
    };
  }

  function init() {
    resize();
    particles = Array.from({ length: 80 }, mkParticle);
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    particles.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.color + p.alpha + ')';
      ctx.fill();

      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0) p.x = W;
      if (p.x > W) p.x = 0;
      if (p.y < 0) p.y = H;
      if (p.y > H) p.y = 0;
    });
    requestAnimationFrame(draw);
  }

  window.addEventListener('resize', resize);
  init();
  draw();
})();

// ── HEADER SCROLL SHADOW ─────────────────────────────────────────────────
(function headerScroll() {
  const header = document.getElementById('site-header');
  if (!header) return;
  const onScroll = () => {
    header.classList.toggle('scrolled', window.scrollY > 16);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
})();

// ── SCROLL REVEAL ────────────────────────────────────────────────────────
(function scrollReveal() {
  const targets = document.querySelectorAll(
    '.card, .scoring-text, .score-visual, .upload-form, .section-label, .section-title, .scoring-desc, .scoring-checks, .upload-desc'
  );
  targets.forEach(el => el.classList.add('reveal'));

  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('visible');
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.12 });

  targets.forEach(el => io.observe(el));
})();

// ── SCORE RING ANIMATION ─────────────────────────────────────────────────
(function scoreRing() {
  const ring   = document.getElementById('ring-fill-el');
  const counter = document.getElementById('score-counter');
  const verdict = document.getElementById('score-verdict');
  if (!ring || !counter) return;

  const CIRCUMFERENCE = 2 * Math.PI * 82; // ≈ 515
  const DEMO_SCORE = 88;
  let animated = false;

  function animateScore(score) {
    const ratio = score / 100;
    const offset = CIRCUMFERENCE * (1 - ratio);
    ring.style.strokeDashoffset = offset;

    // count up
    let current = 0;
    const step = score / 60;
    const interval = setInterval(() => {
      current = Math.min(current + step, score);
      counter.textContent = Math.round(current);
      if (current >= score) {
        clearInterval(interval);
        verdict.textContent = score >= 85 ? 'Mülakat Hazır ✓' : 'Optimizasyon Gerekli';
        verdict.style.color  = score >= 85 ? '#8338EC' : '#FB5607';
      }
    }, 18);
  }

  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting && !animated) {
        animated = true;
        animateScore(DEMO_SCORE);
        io.disconnect();
      }
    });
  }, { threshold: 0.4 });

  const section = document.getElementById('scoring');
  if (section) io.observe(section);
})();

// ── DROPZONE ─────────────────────────────────────────────────────────────
(function dropzone() {
  const zone     = document.getElementById('dropzone');
  const fileInput = document.getElementById('cv-file');
  const label    = document.getElementById('dropzone-text');
  if (!zone || !fileInput) return;

  const setFile = (file) => {
    if (!file) return;
    label.textContent = `✓ ${file.name}`;
    zone.style.borderColor = '#8338EC';
    zone.style.background  = 'rgba(131,56,236,.04)';
  };

  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) setFile(fileInput.files[0]);
  });

  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('active');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('active'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('active');
    const file = e.dataTransfer.files[0];
    if (file) setFile(file);
  });

  zone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') fileInput.click();
  });
})();

// ── FORM SUBMIT ───────────────────────────────────────────────────────────
(function formSubmit() {
  const form = document.getElementById('upload-form');
  const btn  = document.getElementById('btn-start-analysis');
  if (!form || !btn) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const position = document.getElementById('position').value.trim();
    const region   = document.getElementById('region').value.trim();
    const file     = document.getElementById('cv-file').files[0];

    if (!position || !region) {
      showToast('Lütfen pozisyon ve bölge bilgilerini doldurun.');
      return;
    }
    if (!file) {
      showToast('Lütfen CV dosyanızı yükleyin.');
      return;
    }

    btn.disabled = true;
    btn.querySelector('.btn-text').textContent = 'Analiz ediliyor…';

    // Simulate async analysis (replace with real API call)
    await new Promise(r => setTimeout(r, 2200));

    btn.disabled = false;
    btn.querySelector('.btn-text').textContent = 'Start';
    showToast('Analiz tamamlandı! Sonuçlar hazırlanıyor.', 'success');
  });
})();

// ── TOAST ─────────────────────────────────────────────────────────────────
function showToast(msg, type = 'info') {
  const existing = document.getElementById('toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'toast';
  toast.setAttribute('role', 'alert');
  toast.setAttribute('aria-live', 'polite');

  const bg = type === 'success'
    ? 'linear-gradient(110deg,#8338EC,#FF006E)'
    : '#2D3142';

  Object.assign(toast.style, {
    position:     'fixed',
    bottom:       '32px',
    right:        '32px',
    background:   bg,
    color:        '#fff',
    padding:      '14px 24px',
    borderRadius: '14px',
    fontSize:     '.88rem',
    fontWeight:   '600',
    fontFamily:   'Inter, sans-serif',
    boxShadow:    '0 8px 32px rgba(0,0,0,.18)',
    zIndex:       '9999',
    maxWidth:     '320px',
    lineHeight:   '1.5',
    opacity:      '0',
    transform:    'translateY(12px)',
    transition:   'opacity .3s ease, transform .3s ease',
  });

  toast.textContent = msg;
  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.style.opacity   = '1';
    toast.style.transform = 'translateY(0)';
  });

  setTimeout(() => {
    toast.style.opacity   = '0';
    toast.style.transform = 'translateY(12px)';
    setTimeout(() => toast.remove(), 350);
  }, 3800);
}

// ── SMOOTH ACTIVE NAV ─────────────────────────────────────────────────────
(function activeNav() {
  const links = document.querySelectorAll('.nav-link');
  const sections = ['hero', 'features', 'scoring', 'upload'].map(id =>
    document.getElementById(id)
  ).filter(Boolean);

  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        const id = e.target.id;
        links.forEach(l => {
          l.style.color = l.getAttribute('href') === `#${id}` ? '#8338EC' : '';
        });
      }
    });
  }, { threshold: 0.4 });

  sections.forEach(s => io.observe(s));
})();

// Footer year
document.getElementById('year').textContent = new Date().getFullYear();

// Header shrink on scroll + scroll progress bar
const header = document.getElementById('siteHeader');
const progressBar = document.getElementById('progressBar');

function onScroll(){
  const y = window.scrollY || document.documentElement.scrollTop;
  header.classList.toggle('scrolled', y > 24);

  const docHeight = document.documentElement.scrollHeight - window.innerHeight;
  const pct = docHeight > 0 ? (y / docHeight) * 100 : 0;
  progressBar.style.width = pct + '%';
}
onScroll();
window.addEventListener('scroll', onScroll, { passive: true });

// Mobile menu toggle
const menuToggle = document.getElementById('menuToggle');
const mainNav = document.getElementById('mainNav');

menuToggle.addEventListener('click', () => {
  const open = mainNav.classList.toggle('open');
  menuToggle.setAttribute('aria-expanded', String(open));
  menuToggle.classList.toggle('active', open);
});

mainNav.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', () => {
    mainNav.classList.remove('open');
    menuToggle.setAttribute('aria-expanded', 'false');
    menuToggle.classList.remove('active');
  });
});

// Scroll-reveal animations
const revealEls = document.querySelectorAll('.reveal');
if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

  revealEls.forEach(el => io.observe(el));
} else {
  revealEls.forEach(el => el.classList.add('in'));
}

// Magnetic hover effect on primary CTAs (desktop only, subtle)
const magnets = document.querySelectorAll('.magnetic');
const isFinePointer = window.matchMedia('(pointer: fine)').matches;

if (isFinePointer) {
  magnets.forEach(btn => {
    btn.addEventListener('mousemove', (e) => {
      const rect = btn.getBoundingClientRect();
      const x = e.clientX - rect.left - rect.width / 2;
      const y = e.clientY - rect.top - rect.height / 2;
      btn.style.transform = `translate(${x * 0.12}px, ${y * 0.25}px)`;
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.transform = '';
    });
  });
}

// Quick contact form — client-side only (no backend wired up yet)
const quickForm = document.getElementById('quickForm');
const formNote = document.getElementById('formNote');

if (quickForm) {
  quickForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = quickForm.name.value.trim();
    formNote.innerHTML = `Thanks${name ? ', ' + name.split(' ')[0] : ''} — for the fastest response, ` +
      `<a href="tel:7707573097">call (770) 757-3097</a> now and mention what you just described.`;
    quickForm.querySelector('button[type="submit"]').textContent = 'Got it — now give us a call';
  });
}

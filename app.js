/* ===========================================================
   Femi9 - cart + interactions
   ============================================================ */
(function () {
  'use strict';

  const PRODUCTS = {
    p330dw: { name: '330mm Double Wings', price: 225, img: 'assets/img/prod-330-double.jpg', meta: '9 pads · 330mm' },
    p290l9: { name: '290mm Large',        price: 198, img: 'assets/img/prod-290-large9.jpg', meta: '9 pads · 290mm' },
    p330cw: { name: '330mm Centre Wings', price: 225, img: 'assets/img/prod-330-centre.jpg', meta: '9 pads · 330mm' },
    p290l3: { name: '290mm Starter',      price: 72,  img: 'assets/img/prod-290-large3.jpg', meta: '3 pads · 290mm' }
  };
  const FREE_SHIP = 999;
  const WA_NUMBER = '919042916499';

  /** cart = { id: qty } */
  const cart = {};

  const $ = (id) => document.getElementById(id);
  const rupees = (n) => 'Rs.' + n.toLocaleString('en-IN');

  const overlay   = $('overlay');
  const drawer    = $('drawer');
  const drawerBody= $('drawerBody');
  const drawerFoot= $('drawerFoot');
  const countEl   = $('cartCount');
  const toastEl   = $('toast');
  const toastText = $('toastText');

  /* ---------- cart drawer open/close ---------- */
  function openCart() {
    overlay.classList.add('open');
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }
  function closeCart() {
    overlay.classList.remove('open');
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }
  $('cartOpen').addEventListener('click', openCart);
  $('cartClose').addEventListener('click', closeCart);
  overlay.addEventListener('click', closeCart);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeCart(); });

  /* ---------- toast ---------- */
  let toastTimer;
  function toast(msg) {
    toastText.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2200);
  }

  /* ---------- cart mutations ---------- */
  function add(id) {
    cart[id] = (cart[id] || 0) + 1;
    render();
    toast(PRODUCTS[id].name + ' added to bag');
  }
  function setQty(id, q) {
    if (q <= 0) delete cart[id];
    else cart[id] = q;
    render();
  }

  /* ---------- totals ---------- */
  function totals() {
    let sum = 0, items = 0;
    for (const id in cart) { sum += PRODUCTS[id].price * cart[id]; items += cart[id]; }
    return { sum, items };
  }

  /* ---------- render ---------- */
  function render() {
    const { sum, items } = totals();

    // nav badge
    countEl.textContent = items;
    countEl.classList.toggle('show', items > 0);

    // drawer body
    if (items === 0) {
      drawerBody.innerHTML =
        '<div class="cart-empty">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>' +
          '<p>Your bag is empty.<br>Comfort is one tap away.</p>' +
          '<button class="btn btn-primary" id="emptyShop">Shop pads</button>' +
        '</div>';
      drawerFoot.style.display = 'none';
      const es = $('emptyShop');
      if (es) es.addEventListener('click', () => { closeCart(); location.hash = '#products'; });
      return;
    }

    let html = '';
    for (const id in cart) {
      const p = PRODUCTS[id], q = cart[id];
      html +=
        '<div class="ci">' +
          '<div class="ci-img"><img src="' + p.img + '" alt="' + p.name + '"></div>' +
          '<div class="ci-info">' +
            '<b>' + p.name + '</b><small>' + p.meta + '</small>' +
            '<div class="ci-bottom">' +
              '<div class="qty">' +
                '<button data-dec="' + id + '" aria-label="Decrease quantity">&minus;</button>' +
                '<span>' + q + '</span>' +
                '<button data-inc="' + id + '" aria-label="Increase quantity">+</button>' +
              '</div>' +
              '<span class="ci-price">' + rupees(p.price * q) + '</span>' +
            '</div>' +
          '</div>' +
        '</div>';
    }
    drawerBody.innerHTML = html;

    // totals
    $('subtotal').textContent = rupees(sum);
    $('total').textContent = rupees(sum);
    const away = FREE_SHIP - sum;
    $('shipHint').textContent = away > 0
      ? 'Add ' + rupees(away) + ' more for free shipping'
      : 'You have unlocked free shipping';
    drawerFoot.style.display = 'block';

    // wire qty buttons
    drawerBody.querySelectorAll('[data-inc]').forEach((b) =>
      b.addEventListener('click', () => setQty(b.dataset.inc, cart[b.dataset.inc] + 1)));
    drawerBody.querySelectorAll('[data-dec]').forEach((b) =>
      b.addEventListener('click', () => setQty(b.dataset.dec, cart[b.dataset.dec] - 1)));
  }

  /* ---------- add-to-bag buttons ---------- */
  document.querySelectorAll('.add').forEach((btn) =>
    btn.addEventListener('click', () => add(btn.dataset.id)));

  /* ---------- WhatsApp checkout ---------- */
  $('checkout').addEventListener('click', (e) => {
    e.preventDefault();
    const { sum, items } = totals();
    if (items === 0) return;
    let msg = 'Hi Femi9! I would like to order:\n';
    for (const id in cart) {
      const p = PRODUCTS[id], q = cart[id];
      msg += '\n• ' + p.name + ' x' + q + ' (' + rupees(p.price * q) + ')';
    }
    msg += '\n\nTotal: ' + rupees(sum);
    window.open('https://wa.me/' + WA_NUMBER + '?text=' + encodeURIComponent(msg), '_blank');
  });

  /* ---------- nav shadow on scroll (rAF, no state) ---------- */
  const nav = $('nav');
  let ticking = false;
  function onScroll() {
    if (!ticking) {
      window.requestAnimationFrame(() => {
        nav.classList.toggle('scrolled', window.scrollY > 12);
        ticking = false;
      });
      ticking = true;
    }
  }
  window.addEventListener('scroll', onScroll, { passive: true });

  /* ---------- mobile menu ---------- */
  const burger = $('burger'), mm = $('mobileMenu');
  burger.addEventListener('click', () => {
    const open = mm.classList.toggle('open');
    burger.setAttribute('aria-expanded', String(open));
  });
  mm.querySelectorAll('a').forEach((a) =>
    a.addEventListener('click', () => {
      mm.classList.remove('open');
      burger.setAttribute('aria-expanded', 'false');
    }));

  /* ---------- newsletter (client-only, nothing is sent) ---------- */
  const nlForm = $('nlForm');
  if (nlForm) {
    nlForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = $('nlEmail');
      const val = (email.value || '').trim();
      if (!val || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
        email.focus();
        toast('Please enter a valid email');
        return;
      }
      email.value = '';
      toast('Thanks! You are on the list');
    });
  }

  /* ---------- scroll reveal ---------- */
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const reveals = document.querySelectorAll('.reveal');
  if (reduce || !('IntersectionObserver' in window)) {
    reveals.forEach((el) => el.classList.add('in'));
  } else {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
      });
    }, { threshold: 0.14, rootMargin: '0px 0px -8% 0px' });
    reveals.forEach((el) => io.observe(el));
  }

  render();
})();

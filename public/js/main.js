// ===== STATE =====
let cart = JSON.parse(localStorage.getItem('lora_cart_kz') || '[]');
let wishlist = JSON.parse(localStorage.getItem('lora_wishlist_kz') || '[]');
let allProducts = [];
let currentCategory = 'all';
let currentSort = '';
let currentSearch = '';
let modalQtyVal = 1;
let currentPage = 1;
const PRODUCTS_PER_PAGE = 12;

let CATEGORIES = { all:'Все', sets:'Комплекты', bras:'Бюстгальтеры', panties:'Трусики', bodies:'Боди', corsets:'Корсеты', nightwear:'Пижамы' };

// Maps Russian color names → CSS color (supports both text names and HEX)
const COLOR_NAME_MAP = {
  'черный':'#1a1a2e','чёрный':'#1a1a2e','белый':'#f5f5f5','кремовый':'#fff8dc',
  'молочный':'#fff8f0','слоновая кость':'#fffff0','розовый':'#f4b8c8',
  'нежно-розовый':'#fce8ee','светло-розовый':'#fce8ee','пудровый':'#f2c4ce',
  'персиковый':'#ffcba4','телесный':'#f2c5a0','беж':'#e8d5b7','бежевый':'#e8d5b7',
  'золотой':'#c9a96e','золотистый':'#c9a96e','шампань':'#f7e7ce','карамельный':'#c68c5a',
  'красный':'#e74c3c','малиновый':'#c0392b','бордовый':'#8b1a1a','вишневый':'#9b1b30',
  'синий':'#2196f3','темно-синий':'#1a237e','голубой':'#87ceeb','морской':'#006994',
  'серый':'#9e9e9e','светло-серый':'#e0e0e0','серебристый':'#c0c0c0','графитовый':'#454545',
  'фиолетовый':'#9c27b0','лиловый':'#dda0dd','сиреневый':'#c39bd3',
  'зеленый':'#4caf50','зелёный':'#4caf50','мятный':'#98d8c8','изумрудный':'#2ecc71',
  'коричневый':'#795548','шоколадный':'#4e2c1a',
};

function resolveColor(str) {
  const s = (str || '').trim().toLowerCase();
  if (/^#[0-9a-f]{3,6}$/i.test(s) || s.startsWith('rgb')) return str.trim();
  return COLOR_NAME_MAP[s] || null;
}

// Returns HTML for one color option button (swatch or text chip)
function colorOptionHtml(colorStr, idx, selected = false) {
  const css = resolveColor(colorStr);
  const sel = idx === 0 || selected ? 'selected' : '';
  if (css) {
    return `<button class="color-btn ${sel}" style="background:${css}" onclick="selectColor(this)" title="${esc(colorStr)}"></button>`;
  }
  return `<button class="color-chip-text ${sel}" onclick="selectColor(this)" data-color="${esc(colorStr)}">${esc(colorStr)}</button>`;
}
const EMOJIS = { sets:'👙', bras:'🩱', panties:'🩲', bodies:'💃', corsets:'🎀', nightwear:'🌙' };
const CLOTHING_SIZES = { XS:'XS (40–42)', S:'S (42–44)', M:'M (44–46)', L:'L (46–48)', XL:'XL (48–50)', XXL:'XXL (50–52)' };
const FREE_DELIVERY_THRESHOLD = 15000;

// ===== CLIENT-SIDE SANITIZER (XSS prevention in innerHTML) =====
function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ===== PRICE FORMAT =====
function fmt(amount) {
  return Number(amount).toLocaleString('ru-KZ') + ' ₸';
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => document.getElementById('preloader').classList.add('hidden'), 1800);
  initHeader();
  updateBadges();
  loadProducts();
  initCart();
  initScrollTop();
  initIntersectionObserver();
  initSizeGuide();
  initPhoneMask();
  initCatTabs();
  initReturnForm();
});

// ===== HEADER =====
function initHeader() {
  const header = document.getElementById('header');
  const burgerBtn = document.getElementById('burgerBtn');
  const mainNav = document.getElementById('mainNav');
  const navOverlay = document.getElementById('navOverlay');
  const searchBar = document.getElementById('searchBar');
  const searchInput = document.getElementById('searchInput');

  window.addEventListener('scroll', () => {
    header.classList.toggle('scrolled', window.scrollY > 50);
    document.getElementById('scrollTop').classList.toggle('show', window.scrollY > 400);
  });

  burgerBtn.addEventListener('click', () => {
    burgerBtn.classList.toggle('active');
    mainNav.classList.toggle('open');
    navOverlay.classList.toggle('show');
  });
  navOverlay.addEventListener('click', closeNav);

  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
      link.classList.add('active');
      currentCategory = link.dataset.category;
      currentPage = 1;
      syncCatTabs(currentCategory);
      renderProducts();
      closeNav();
      document.getElementById('shop').scrollIntoView({ behavior: 'smooth' });
    });
  });

  document.getElementById('searchToggle').addEventListener('click', () => {
    searchBar.classList.toggle('open');
    if (searchBar.classList.contains('open')) searchInput.focus();
  });
  document.getElementById('searchClose').addEventListener('click', () => {
    searchBar.classList.remove('open');
    searchInput.value = '';
    currentSearch = '';
    currentPage = 1;
    renderProducts();
  });
  searchInput.addEventListener('input', () => {
    currentSearch = searchInput.value.trim();
    currentPage = 1;
    renderProducts();
  });
  document.getElementById('sortSelect').addEventListener('change', e => {
    currentSort = e.target.value;
    currentPage = 1;
    renderProducts();
  });
  document.getElementById('cartToggle').addEventListener('click', openCart);
  document.getElementById('wishlistBtn').addEventListener('click', () => showToast('Открывайте карточки товаров для добавления в избранное ❤️'));
}

function closeNav() {
  document.getElementById('burgerBtn').classList.remove('active');
  document.getElementById('mainNav').classList.remove('open');
  document.getElementById('navOverlay').classList.remove('show');
}

// ===== PRODUCTS =====
async function loadProducts() {
  try {
    const [productsRes, catsRes] = await Promise.all([
      fetch('/api/products'),
      fetch('/api/categories')
    ]);
    allProducts = await productsRes.json();
    if (catsRes.ok) {
      const cats = await catsRes.json();
      cats.forEach(c => { CATEGORIES[c.slug] = c.name; });
    }
    renderProducts();
  } catch (e) {
    document.getElementById('productsEmpty').style.display = 'block';
  }
}

function renderProducts() {
  let products = [...allProducts];
  if (currentCategory !== 'all') products = products.filter(p => p.category === currentCategory);
  if (currentSearch) products = products.filter(p => p.name.toLowerCase().includes(currentSearch.toLowerCase()));
  if (currentSort === 'price_asc') products.sort((a, b) => a.price - b.price);
  else if (currentSort === 'price_desc') products.sort((a, b) => b.price - a.price);
  else if (currentSort === 'rating') products.sort((a, b) => b.rating - a.rating);

  const totalCount = products.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PRODUCTS_PER_PAGE));
  if (currentPage > totalPages) currentPage = totalPages;
  const start = (currentPage - 1) * PRODUCTS_PER_PAGE;
  const paged = products.slice(start, start + PRODUCTS_PER_PAGE);

  const grid = document.getElementById('productsGrid');
  const empty = document.getElementById('productsEmpty');
  if (totalCount === 0) { grid.innerHTML = ''; empty.style.display = 'block'; renderPagination(0, 0); return; }
  empty.style.display = 'none';
  grid.innerHTML = paged.map((p, i) => productCard(p, i)).join('');
  renderPagination(totalPages, totalCount);
}

function renderPagination(totalPages, totalCount) {
  const el = document.getElementById('pagination');
  if (!el) return;
  if (totalPages <= 1) { el.innerHTML = ''; return; }

  const start = (currentPage - 1) * PRODUCTS_PER_PAGE + 1;
  const end = Math.min(currentPage * PRODUCTS_PER_PAGE, totalCount);

  const nums = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) nums.push(i);
  }
  let pages = '';
  let prev = 0;
  for (const p of nums) {
    if (prev && p - prev > 1) pages += `<span class="pg-dots">…</span>`;
    pages += `<button class="pg-btn${p === currentPage ? ' pg-btn--active' : ''}" onclick="goToPage(${p})">${p}</button>`;
    prev = p;
  }

  el.innerHTML = `
    <div class="pg-info">Показано ${start}–${end} из ${totalCount} товаров</div>
    <div class="pg-buttons">
      <button class="pg-btn pg-btn--nav" onclick="goToPage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>‹</button>
      ${pages}
      <button class="pg-btn pg-btn--nav" onclick="goToPage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>›</button>
    </div>
  `;
}

window.goToPage = function(page) {
  if (page < 1) return;
  currentPage = page;
  renderProducts();
  document.getElementById('shop').scrollIntoView({ behavior: 'smooth' });
};

function productCard(p, i) {
  const discount = p.oldPrice ? Math.round((1 - p.price / p.oldPrice) * 100) : 0;
  const isWishlisted = wishlist.includes(p.id);
  const stars = '★'.repeat(Math.round(p.rating)) + '☆'.repeat(5 - Math.round(p.rating));
  const emoji = EMOJIS[p.category] || '🛍️';
  const firstSize = p.sizes && p.sizes.length ? p.sizes[0] : '';

  return `
    <div class="product-card" data-index="${i}" onclick="openProductModal(${p.id})">
      <div class="product-card__image-wrap">
        <div class="product-card__placeholder">${emoji}</div>
        ${p.image ? `<img class="product-card__img" src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy" onerror="this.style.display='none'">` : ''}
        ${p.badge ? `<div class="product-card__badge ${p.badge==='Эксклюзив'?'gold':''}">${esc(p.badge)}</div>` : ''}
        <div class="product-card__actions" onclick="event.stopPropagation()">
          <button class="product-card__action-btn ${isWishlisted?'wishlisted':''}" onclick="toggleWishlist(${p.id},this)" title="В избранное">
            <svg viewBox="0 0 24 24" fill="${isWishlisted?'currentColor':'none'}" stroke="currentColor" stroke-width="1.5"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          </button>
          <button class="product-card__action-btn" onclick="addToCart(${p.id},'${esc(firstSize)}')" title="В корзину">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
          </button>
        </div>
      </div>
      <div class="product-card__body">
        <div class="product-card__category">${esc(CATEGORIES[p.category] || p.category)}</div>
        <div class="product-card__name">${esc(p.name)}</div>
        <div class="product-card__rating">
          <span class="stars">${stars}</span>
          <span class="product-card__rating-count">(${p.reviews})</span>
        </div>
        <div class="product-card__price">
          <span class="price--current">${fmt(p.price)}</span>
          ${p.oldPrice ? `<span class="price--old">${fmt(p.oldPrice)}</span><span class="price--discount">-${discount}%</span>` : ''}
        </div>
        <button class="product-card__add" onclick="event.stopPropagation(); openProductModal(${p.id})">Выбрать размер</button>
      </div>
    </div>
  `;
}

// ===== PRODUCT MODAL =====
function openProductModal(id) {
  const p = allProducts.find(x => x.id === id);
  if (!p) return;
  const discount = p.oldPrice ? Math.round((1 - p.price / p.oldPrice) * 100) : 0;
  const stars = '★'.repeat(Math.round(p.rating)) + '☆'.repeat(5 - Math.round(p.rating));
  const emoji = EMOJIS[p.category] || '🛍️';
  const isBra = p.sizeType === 'bra';
  modalQtyVal = 1;

  document.getElementById('modalContent').innerHTML = `
    <div class="modal-image-wrap">
      <div class="modal-placeholder">${emoji}</div>
      ${p.image ? `<img src="${esc(p.image)}" alt="${esc(p.name)}" onerror="this.style.display='none'">` : ''}
    </div>
    <div class="modal-info">
      <div class="modal-category">${esc(CATEGORIES[p.category] || p.category)}</div>
      <h2 class="modal-name">${esc(p.name)}</h2>
      <div class="modal-rating">
        <span class="stars">${stars}</span>
        <span style="font-size:.8rem;color:var(--color-gray);margin-left:6px">${p.rating} (${p.reviews} отзывов)</span>
      </div>
      <div class="modal-price">
        <span class="price--current">${fmt(p.price)}</span>
        ${p.oldPrice ? `<span class="price--old">${fmt(p.oldPrice)}</span><span class="price--discount">-${discount}%</span>` : ''}
      </div>
      <p class="modal-description">${esc(p.description)}</p>
      ${p.sizes && p.sizes.length ? `
        <div class="modal-section-header">
          <div class="modal-section-title">Размер</div>
          <button class="size-guide-btn" onclick="openSizeGuide('${isBra ? 'bra' : 'clothing'}')">📏 Таблица размеров</button>
        </div>
        <div class="size-options">
          ${p.sizes.map((s, i) => `<button class="size-btn ${i===0?'selected':''}" onclick="selectSize(this)">${esc(isBra ? s : (CLOTHING_SIZES[s] || s))}</button>`).join('')}
        </div>
      ` : ''}
      ${p.colors && p.colors.length ? `
        <div class="modal-section-title">Цвет</div>
        <div class="color-options">
          ${p.colors.map((c, i) => colorOptionHtml(c, i)).join('')}
        </div>
      ` : ''}
      <div class="modal-add-row">
        <div class="modal-qty">
          <button class="qty-btn" onclick="changeModalQty(-1)">−</button>
          <span class="qty-value" id="modalQtyVal">1</span>
          <button class="qty-btn" onclick="changeModalQty(1)">+</button>
        </div>
        <button class="btn btn--dark" style="flex:1" onclick="addToCartFromModal(${p.id})">В корзину</button>
      </div>
    </div>
  `;
  document.getElementById('modalOverlay').classList.add('show');
  document.body.style.overflow = 'hidden';
}

window.selectSize = btn => {
  btn.closest('.size-options').querySelectorAll('.size-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
};
window.selectColor = btn => {
  btn.closest('.color-options').querySelectorAll('.color-btn, .color-chip-text').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
};
window.changeModalQty = d => {
  modalQtyVal = Math.max(1, Math.min(99, modalQtyVal + d));
  const el = document.getElementById('modalQtyVal');
  if (el) el.textContent = modalQtyVal;
};
window.addToCartFromModal = id => {
  const sizeBtn = document.querySelector('#modalContent .size-btn.selected');
  const colorBtn = document.querySelector('#modalContent .color-btn.selected, #modalContent .color-chip-text.selected');
  const size = sizeBtn ? sizeBtn.textContent : '';
  const color = colorBtn ? (colorBtn.dataset.color || colorBtn.style.background || colorBtn.title || '') : '';
  for (let i = 0; i < modalQtyVal; i++) addToCart(id, size, color);
  closeModal();
};

document.getElementById('modalClose').addEventListener('click', closeModal);
document.getElementById('modalOverlay').addEventListener('click', e => {
  if (e.target === document.getElementById('modalOverlay')) closeModal();
});
function closeModal() {
  document.getElementById('modalOverlay').classList.remove('show');
  document.body.style.overflow = '';
  modalQtyVal = 1;
}

// ===== CART =====
function initCart() {
  document.getElementById('cartClose').addEventListener('click', closeCart);
  document.getElementById('cartOverlay').addEventListener('click', closeCart);
  document.getElementById('checkoutBtn').addEventListener('click', () => {
    closeCart();
    updateCheckoutTotal();
    document.getElementById('checkoutOverlay').classList.add('show');
  });
  document.getElementById('checkoutClose').addEventListener('click', () => {
    document.getElementById('checkoutOverlay').classList.remove('show');
  });
  document.getElementById('checkoutOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('checkoutOverlay'))
      document.getElementById('checkoutOverlay').classList.remove('show');
  });
  document.getElementById('checkoutForm').addEventListener('submit', submitOrder);
}

function addToCart(id, size = '', color = '') {
  const p = allProducts.find(x => x.id === id);
  if (!p) return;
  const key = `${id}_${size}_${color}`;
  const existing = cart.find(c => c.key === key);
  if (existing) existing.qty++;
  else cart.push({ key, id, name: p.name, price: p.price, category: p.category, size, color, qty: 1 });
  saveCart();
  updateCartUI();
  showToast(`«${p.name}» добавлен в корзину 🛍️`);
}
window.addToCart = addToCart;

function removeFromCart(key) {
  cart = cart.filter(c => c.key !== key);
  saveCart();
  updateCartUI();
}

function changeQty(key, delta) {
  const item = cart.find(c => c.key === key);
  if (!item) return;
  item.qty = Math.max(1, item.qty + delta);
  saveCart();
  updateCartUI();
}

function saveCart() {
  localStorage.setItem('lora_cart_kz', JSON.stringify(cart));
}

function updateCartUI() {
  const count = cart.reduce((s, c) => s + c.qty, 0);
  const total = cart.reduce((s, c) => s + c.price * c.qty, 0);
  const countEl = document.getElementById('cartCount');
  countEl.textContent = count;
  countEl.classList.toggle('show', count > 0);

  const itemsEl = document.getElementById('cartItems');
  const footerEl = document.getElementById('cartFooter');

  if (cart.length === 0) {
    itemsEl.innerHTML = `<div class="cart-empty"><div class="cart-empty__icon">🛍️</div><p>Ваша корзина пуста</p></div>`;
    footerEl.style.display = 'none';
    return;
  }

  itemsEl.innerHTML = cart.map(item => `
    <div class="cart-item">
      <div class="cart-item__img">${EMOJIS[item.category] || '🛍️'}</div>
      <div class="cart-item__info">
        <div class="cart-item__name">${esc(item.name)}</div>
        <div class="cart-item__meta">${item.size ? `Размер: ${esc(item.size)}` : ''}</div>
        <div class="cart-item__price">${fmt(item.price * item.qty)}</div>
        <div class="cart-item__controls">
          <button class="qty-btn" onclick="changeQty('${esc(item.key)}',-1)">−</button>
          <span class="qty-value">${item.qty}</span>
          <button class="qty-btn" onclick="changeQty('${esc(item.key)}',1)">+</button>
          <button class="cart-item__remove" onclick="removeFromCart('${esc(item.key)}')">✕</button>
        </div>
      </div>
    </div>
  `).join('');

  footerEl.style.display = 'block';
  document.getElementById('cartTotal').textContent = fmt(total);

  const deliveryEl = document.getElementById('cartDelivery');
  if (total >= FREE_DELIVERY_THRESHOLD) {
    deliveryEl.innerHTML = `<span style="color:#27ae60">✓ Бесплатная доставка</span>`;
  } else {
    const left = FREE_DELIVERY_THRESHOLD - total;
    deliveryEl.innerHTML = `Ещё ${fmt(left)} до бесплатной доставки`;
  }
}

function openCart() {
  updateCartUI();
  document.getElementById('cartSidebar').classList.add('open');
  document.getElementById('cartOverlay').classList.add('show');
  document.body.style.overflow = 'hidden';
}
function closeCart() {
  document.getElementById('cartSidebar').classList.remove('open');
  document.getElementById('cartOverlay').classList.remove('show');
  document.body.style.overflow = '';
}

function updateCheckoutTotal() {
  const total = cart.reduce((s, c) => s + c.price * c.qty, 0);
  const delivery = total >= FREE_DELIVERY_THRESHOLD ? 0 : 1500;
  const el = document.getElementById('checkoutTotalRow');
  el.innerHTML = `
    <div class="checkout-total-row"><span>Товары (${cart.reduce((s,c)=>s+c.qty,0)} шт.)</span><span>${fmt(total)}</span></div>
    <div class="checkout-total-row"><span>Доставка</span><span>${delivery === 0 ? '<span style="color:#27ae60">Бесплатно</span>' : fmt(delivery)}</span></div>
    <div class="checkout-total-row final"><span>Итого</span><span>${fmt(total + delivery)}</span></div>
  `;
}

async function submitOrder(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const data = Object.fromEntries(fd);

  if (!data.phone.match(/^\+?[0-9\s\-(). ]{7,20}$/)) {
    showToast('Введите корректный номер телефона', 'error'); return;
  }

  const total = cart.reduce((s, c) => s + c.price * c.qty, 0);
  const delivery = total >= FREE_DELIVERY_THRESHOLD ? 0 : 1500;

  data.items = cart.map(c => ({ id: c.id, name: c.name, price: c.price, qty: c.qty, size: c.size || '', color: c.color || '' }));
  data.total = total + delivery;

  try {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const r = await res.json();
    if (r.success) {
      cart = []; saveCart(); updateCartUI();
      document.getElementById('checkoutOverlay').classList.remove('show');
      document.body.style.overflow = '';
      showToast('Заказ успешно оформлен! Мы свяжемся с вами ✅', 'success');
      e.target.reset();
    } else {
      showToast(r.error || 'Ошибка оформления заказа', 'error');
    }
  } catch { showToast('Ошибка соединения', 'error'); }
}

// ===== WISHLIST =====
function toggleWishlist(id, btn) {
  const idx = wishlist.indexOf(id);
  const p = allProducts.find(x => x.id === id);
  if (idx === -1) { wishlist.push(id); showToast(`«${p?.name}» добавлен в избранное ❤️`); }
  else { wishlist.splice(idx, 1); showToast(`Удалён из избранного`); }
  localStorage.setItem('lora_wishlist_kz', JSON.stringify(wishlist));
  updateBadges();
  if (btn) {
    const svg = btn.querySelector('svg');
    const isNow = wishlist.includes(id);
    if (svg) svg.setAttribute('fill', isNow ? 'currentColor' : 'none');
    btn.classList.toggle('wishlisted', isNow);
  }
}
window.toggleWishlist = toggleWishlist;

function updateBadges() {
  const wc = document.getElementById('wishlistCount');
  wc.textContent = wishlist.length;
  wc.classList.toggle('show', wishlist.length > 0);
  const cc = document.getElementById('cartCount');
  const cCount = cart.reduce((s, c) => s + c.qty, 0);
  cc.textContent = cCount;
  cc.classList.toggle('show', cCount > 0);
}

// ===== SIZE GUIDE =====
function initSizeGuide() {
  document.getElementById('sizeGuideClose').addEventListener('click', closeSizeGuide);
  document.getElementById('sizeGuideOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('sizeGuideOverlay')) closeSizeGuide();
  });
}

window.openSizeGuide = function(tab = 'clothing') {
  switchSizeTab(tab, document.querySelector(`.sg-tab[data-tab="${tab}"]`));
  document.getElementById('sizeGuideOverlay').classList.add('show');
  document.body.style.overflow = 'hidden';
};
function closeSizeGuide() {
  document.getElementById('sizeGuideOverlay').classList.remove('show');
  document.body.style.overflow = '';
}

window.switchSizeTab = function(tab, btn) {
  document.querySelectorAll('.sg-content').forEach(c => c.style.display = 'none');
  document.querySelectorAll('.sg-tab').forEach(t => t.classList.remove('active'));
  const el = document.getElementById(`sg-${tab}`);
  if (el) el.style.display = 'block';
  if (btn) btn.classList.add('active');
};

window.calculateBraSize = function() {
  const band = parseInt(document.getElementById('calcBand').value);
  const bust = parseInt(document.getElementById('calcBust').value);
  const result = document.getElementById('calcResult');

  if (!band || !bust || band < 55 || bust < 65 || bust <= band) {
    result.className = 'calc-result show';
    result.innerHTML = '⚠️ Проверьте введённые значения';
    return;
  }

  const diff = bust - band;
  let cup = '';
  if (diff <= 11) cup = 'A';
  else if (diff <= 13) cup = 'B';
  else if (diff <= 15) cup = 'C';
  else if (diff <= 17) cup = 'D';
  else if (diff <= 19) cup = 'DD/E';
  else cup = 'F+';

  let bandSize = Math.round(band / 5) * 5;
  if (bandSize < 65) bandSize = 65;
  if (bandSize > 95) bandSize = 95;

  result.className = 'calc-result show';
  result.innerHTML = `Ваш размер: <strong>${bandSize}${cup}</strong> &nbsp;|&nbsp; Разница: ${diff} см → чашка ${cup}`;
};

// ===== PHONE MASK =====
function initPhoneMask() {
  const phone = document.getElementById('phoneInput');
  if (!phone) return;
  phone.addEventListener('input', e => {
    let v = e.target.value.replace(/\D/g, '');
    if (v.startsWith('87') || v.startsWith('77')) {
      v = '7' + v.slice(1);
    }
    if (!v.startsWith('7')) v = '7' + v;
    v = v.slice(0, 11);
    let formatted = '+7';
    if (v.length > 1) formatted += ' (' + v.slice(1, 4);
    if (v.length >= 4) formatted += ') ' + v.slice(4, 7);
    if (v.length >= 7) formatted += '-' + v.slice(7, 9);
    if (v.length >= 9) formatted += '-' + v.slice(9, 11);
    e.target.value = formatted;
  });
}

// ===== OTHER =====
function initScrollTop() {
  document.getElementById('scrollTop').addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}

window.scrollToProducts = () => document.getElementById('shop').scrollIntoView({ behavior: 'smooth' });

function initIntersectionObserver() {
  const observer = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
  }, { threshold: 0.1 });
  document.querySelectorAll('.animate-in').forEach(el => observer.observe(el));
}

function showToast(msg, type = '') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = `toast ${type} show`;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toast.classList.remove('show'), 3500);
}

// ===== CATEGORY TABS =====
function initCatTabs() {
  document.querySelectorAll('.cat-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const cat = tab.dataset.category;
      // Sync with header nav
      document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
      const navLink = document.querySelector(`.nav-link[data-category="${cat}"]`);
      if (navLink) navLink.classList.add('active');
      // Update tab active state
      document.querySelectorAll('.cat-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      // Filter
      currentCategory = cat;
      currentPage = 1;
      renderProducts();
    });
  });
}

// Sync cat tabs when header nav is used
function syncCatTabs(category) {
  document.querySelectorAll('.cat-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.category === category);
  });
}

// ===== RETURN FORM =====
window.openReturnForm = function() {
  document.getElementById('returnOverlay').classList.add('show');
  document.getElementById('returnForm').reset();
  document.getElementById('returnBankField').classList.remove('show');
  document.body.style.overflow = 'hidden';
};

window.closeReturnForm = function() {
  document.getElementById('returnOverlay').classList.remove('show');
  document.body.style.overflow = '';
};

window.toggleReturnBank = function(radio) {
  document.getElementById('returnBankField').classList.toggle('show', radio.value === 'refund');
};

function initReturnForm() {
  // Close on backdrop click
  document.getElementById('returnOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('returnOverlay')) closeReturnForm();
  });

  // Phone mask for return form
  const rPhone = document.getElementById('returnPhone');
  if (rPhone) {
    rPhone.addEventListener('input', e => {
      let v = e.target.value.replace(/\D/g, '');
      if (v.startsWith('87') || v.startsWith('77')) v = '7' + v.slice(1);
      if (!v.startsWith('7')) v = '7' + v;
      v = v.slice(0, 11);
      let f = '+7';
      if (v.length > 1) f += ' (' + v.slice(1, 4);
      if (v.length >= 4) f += ') ' + v.slice(4, 7);
      if (v.length >= 7) f += '-' + v.slice(7, 9);
      if (v.length >= 9) f += '-' + v.slice(9, 11);
      e.target.value = f;
    });
  }

  document.getElementById('returnForm').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = Object.fromEntries(fd.entries());
    const btn = document.getElementById('returnSubmitBtn');
    btn.disabled = true;
    btn.textContent = 'Отправка...';
    try {
      const r = await fetch('/api/returns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Ошибка');
      closeReturnForm();
      showToast('Заявка принята! Мы свяжемся с вами в течение 24 часов ✓', 'success');
    } catch (ex) {
      showToast(ex.message || 'Ошибка отправки', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Отправить заявку';
    }
  });
}

// ===== STATE =====
let adminToken = localStorage.getItem('lora_admin_token') || '';
let currentEmployee = null;
let allProducts = [], allOrders = [], allEmployees = [], allReturns = [], allCategories = [];
let deleteTarget = null;
let deleteType = '';

const SIZE_PRESETS = {
  bra:      '70A, 70B, 70C, 75A, 75B, 75C, 80A, 80B, 80C, 80D, 85B, 85C, 85D',
  hosiery:  '1, 2, 3, 4, 5',
  clothing: 'XS (40-42), S (42-44), M (44-46), L (46-48), XL (48-50), XXL (50-52)',
};

// ===== XSS PREVENTION =====
function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function fmt(n) {
  return Number(n || 0).toLocaleString('ru-KZ') + ' ₸';
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  if (adminToken) checkAuth();
  initLoginForm();
  initSidebar();
  initProductForm();
  initEmployeeForm();
  initCategoryForm();
  initDeleteModal();
  initSearches();
  initChangePassForm();
});

// ===== AUTH =====
async function checkAuth() {
  try {
    const r = await apiFetch('/api/admin/check');
    if (r.success) {
      currentEmployee = r.employee;
      showApp();
    }
  } catch { showLogin(); }
}

function initLoginForm() {
  document.getElementById('loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const errEl = document.getElementById('loginError');
    const btn = document.getElementById('loginBtn');
    errEl.textContent = '';
    btn.disabled = true;
    btn.textContent = 'Вход...';

    try {
      const r = await apiFetch('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({
          username: document.getElementById('loginUser').value,
          password: document.getElementById('loginPass').value
        }),
        headers: { 'Content-Type': 'application/json' }
      });
      if (r.success) {
        adminToken = r.token;
        currentEmployee = r.employee;
        localStorage.setItem('lora_admin_token', adminToken);
        showApp();
      }
    } catch (ex) {
      errEl.textContent = ex.message || 'Ошибка входа';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Войти';
    }
  });
}

window.togglePass = () => {
  const inp = document.getElementById('loginPass');
  inp.type = inp.type === 'password' ? 'text' : 'password';
};
window.toggleEmpPass = () => {
  const inp = document.getElementById('ePassword');
  inp.type = inp.type === 'password' ? 'text' : 'password';
};

document.getElementById('logoutBtn').addEventListener('click', async () => {
  await apiFetch('/api/admin/logout', { method: 'POST' }).catch(() => {});
  adminToken = '';
  currentEmployee = null;
  localStorage.removeItem('lora_admin_token');
  showLogin();
});

function showLogin() {
  document.getElementById('loginScreen').classList.remove('hidden');
  document.getElementById('adminApp').style.display = 'none';
}

function showApp() {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('adminApp').style.display = 'flex';

  // Set employee info
  if (currentEmployee) {
    document.getElementById('empName').textContent = currentEmployee.name || currentEmployee.username;
    document.getElementById('empAvatar').textContent = (currentEmployee.name || currentEmployee.username)[0].toUpperCase();
    document.getElementById('empRole').textContent = roleLabel(currentEmployee.role);
    const topbar = document.getElementById('topbarRole');
    topbar.textContent = roleLabel(currentEmployee.role);
    topbar.className = `topbar-role role-${currentEmployee.role}`;
  }

  // Hide admin-only items for non-admins
  const isAdmin = currentEmployee?.role === 'admin';
  document.querySelectorAll('.admin-only').forEach(el => {
    el.style.display = isAdmin ? 'flex' : 'none';
  });
  document.querySelectorAll('.editor-only').forEach(el => {
    el.style.display = ['admin','manager'].includes(currentEmployee?.role) ? 'flex' : 'none';
  });

  loadCategories();
  navigateTo('dashboard');
}

// ===== API =====
async function apiFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { 'Authorization': `Bearer ${adminToken}`, ...(options.headers || {}) }
  });
  const data = await res.json();
  if (res.status === 401) { showLogin(); throw new Error('Сессия истекла'); }
  if (!res.ok) throw new Error(data.error || `Ошибка ${res.status}`);
  return data;
}

// ===== SIDEBAR =====
function initSidebar() {
  document.querySelectorAll('.admin-nav__item[data-page]').forEach(item => {
    item.addEventListener('click', e => {
      e.preventDefault();
      navigateTo(item.dataset.page);
      document.getElementById('adminSidebar').classList.remove('open');
    });
  });
  document.getElementById('sidebarToggle').addEventListener('click', () => {
    document.getElementById('adminSidebar').classList.toggle('open');
  });

}

function navigateTo(page) {
  const adminPages = ['employees', 'audit', 'categories'];
  if (adminPages.includes(page) && currentEmployee?.role !== 'admin') {
    adminToast('Недостаточно прав доступа', 'error'); return;
  }

  document.querySelectorAll('.admin-page').forEach(p => p.style.display = 'none');
  document.querySelectorAll('.admin-nav__item[data-page]').forEach(i => i.classList.remove('active'));
  const el = document.getElementById(`page-${page}`);
  if (el) el.style.display = 'block';
  const nav = document.querySelector(`.admin-nav__item[data-page="${page}"]`);
  if (nav) nav.classList.add('active');
  const titles = { dashboard:'Дашборд', products:'Товары', orders:'Заказы', employees:'Сотрудники', categories:'Категории', audit:'Журнал безопасности', returns:'Заявки на возврат', password:'Сменить пароль' };
  document.getElementById('pageTitle').textContent = titles[page] || page;

  if (page === 'dashboard') loadDashboard();
  else if (page === 'products') loadProductsPage();
  else if (page === 'orders') loadOrdersPage();
  else if (page === 'employees') loadEmployeesPage();
  else if (page === 'categories') loadCategoriesPage();
  else if (page === 'audit') loadAuditPage();
  else if (page === 'returns') loadReturnsPage();
}

// ===== DASHBOARD =====
async function loadDashboard() {
  try {
    const [products, orders] = await Promise.all([
      apiFetch('/api/admin/products'),
      apiFetch('/api/admin/orders')
    ]);
    allProducts = products; allOrders = orders;

    document.getElementById('statProducts').textContent = products.length;
    document.getElementById('statOrders').textContent = orders.length;
    document.getElementById('statRevenue').textContent = orders.reduce((s,o) => s+(o.total||0), 0).toLocaleString('ru-KZ');
    document.getElementById('statNew').textContent = orders.filter(o => o.status === 'new').length;

    const tbody = document.getElementById('dashOrdersBody');
    tbody.innerHTML = orders.slice(0, 7).map(o => `
      <tr>
        <td><b class="order-id-link" onclick="showOrderDetail('${o.id}')">#${o.id}</b></td>
        <td>${esc(o.name || '—')}</td>
        <td>${esc(o.city || '—')}</td>
        <td><b>${fmt(o.total)}</b></td>
        <td>${statusBadge(o.status)}</td>
        <td>${formatDate(o.createdAt)}</td>
      </tr>
    `).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--color-gray);padding:32px">Заказов пока нет</td></tr>';
  } catch (e) { adminToast('Ошибка загрузки', 'error'); }
}

// ===== PRODUCTS =====
async function loadProductsPage() {
  try {
    allProducts = await apiFetch('/api/admin/products');
    renderProductsTable(allProducts);
  } catch { adminToast('Ошибка загрузки товаров', 'error'); }
}

function renderProductsTable(products) {
  const EMOJIS = { sets:'👙', bras:'🩱', panties:'🩲', bodies:'💃', corsets:'🎀', nightwear:'🌙', swimwear:'🩱', homewear:'🏠', accessories:'💎', socks:'🧦', tights:'🦵', sportswear:'🏋️' };
  const SIZE_TYPE_LABELS = { clothing:'Одежные размеры', bra:'Размеры бюстгальтера', hosiery:'Чулочные размеры' };
  const getCatName = slug => {
    const cat = allCategories.find(c => c.slug === slug);
    return cat ? cat.name : slug;
  };
  const canEdit = ['admin','manager'].includes(currentEmployee?.role);

  const tbody = document.getElementById('productsTableBody');
  tbody.innerHTML = products.map(p => `
    <tr>
      <td style="color:var(--color-gray)">#${p.id}</td>
      <td>
        <div class="prod-info">
          <div class="prod-thumb">${EMOJIS[p.category] || '🛍️'}</div>
          <div>
            <div class="prod-name">${esc(p.name)}</div>
            <div class="prod-meta">${SIZE_TYPE_LABELS[p.sizeType] || 'Одежные размеры'} · ${(p.sizes||[]).slice(0,3).map(esc).join(', ')}${p.sizes?.length > 3 ? '...' : ''}</div>
          </div>
        </div>
      </td>
      <td>${esc(getCatName(p.category))}</td>
      <td>
        <b>${fmt(p.price)}</b>
        ${p.oldPrice ? `<br><span style="color:var(--color-gray);font-size:.75rem;text-decoration:line-through">${fmt(p.oldPrice)}</span>` : ''}
      </td>
      <td>${p.inStock ? '<span class="badge badge--instock">В наличии</span>' : '<span class="badge badge--outstock">Нет</span>'}</td>
      <td>⭐ ${p.rating} <span style="color:var(--color-gray);font-size:.72rem">(${p.reviews})</span></td>
      <td>
        <div class="action-btns">
          ${canEdit ? `<button class="action-btn action-btn--edit" onclick="editProduct(${p.id})" title="Редактировать">✏️</button>` : ''}
          ${currentEmployee?.role === 'admin' ? `<button class="action-btn action-btn--delete" onclick="confirmDelete(${p.id},'product','${esc(p.name)}')" title="Удалить">🗑️</button>` : ''}
        </div>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="7" style="text-align:center;color:var(--color-gray);padding:40px">Нет товаров</td></tr>';
}

// ===== PRODUCT FORM =====
// ===== COLOR NAME MAP =====
const ADMIN_COLOR_MAP = {
  'черный':'#1a1a2e','чёрный':'#1a1a2e','белый':'#f9f9f9','кремовый':'#fff8dc',
  'молочный':'#fff8f0','слоновая кость':'#fffff0','розовый':'#f4b8c8',
  'нежно-розовый':'#fce8ee','светло-розовый':'#fce8ee','пудровый':'#f2c4ce',
  'персиковый':'#ffcba4','телесный':'#f2c5a0','беж':'#e8d5b7','бежевый':'#e8d5b7',
  'золотой':'#c9a96e','золотистый':'#c9a96e','шампань':'#f7e7ce','карамельный':'#c68c5a',
  'красный':'#e74c3c','малиновый':'#c0392b','бордовый':'#8b1a1a','вишневый':'#9b1b30',
  'синий':'#2196f3','темно-синий':'#1a237e','голубой':'#87ceeb','морской':'#006994','лазурный':'#007fff',
  'серый':'#9e9e9e','светло-серый':'#e0e0e0','серебристый':'#c0c0c0','графитовый':'#454545',
  'фиолетовый':'#9c27b0','лиловый':'#dda0dd','сиреневый':'#c39bd3','аметистовый':'#9966cc',
  'зеленый':'#4caf50','зелёный':'#4caf50','мятный':'#98d8c8','изумрудный':'#2ecc71',
  'коричневый':'#795548','шоколадный':'#4e2c1a',
};

function resolveColorAdmin(str) {
  const s = str.trim().toLowerCase();
  if (/^#[0-9a-f]{3,6}$/i.test(s) || s.startsWith('rgb')) return str.trim();
  return ADMIN_COLOR_MAP[s] || null;
}

window.updateColorPreview = function(val) {
  const chips = document.getElementById('colorPreviewChips');
  if (!chips) return;
  const colors = val.split(',').map(c => c.trim()).filter(Boolean);
  chips.innerHTML = colors.map(c => {
    const css = resolveColorAdmin(c);
    if (css) {
      const isDark = isColorDark(css);
      return `<span class="cp-swatch" style="background:${css}" title="${esc(c)}"></span>
              <span class="cp-name" style="padding-left:4px">${esc(c)}</span>`;
    }
    return `<span class="cp-name">${esc(c)}</span>`;
  }).join('');
};

function isColorDark(hex) {
  const c = hex.replace('#','');
  const r = parseInt(c.slice(0,2)||'ff',16);
  const g = parseInt(c.slice(2,4)||'ff',16);
  const b = parseInt(c.slice(4,6)||'ff',16);
  return (r*299 + g*587 + b*114) / 1000 < 128;
}

// ===== IMAGE UPLOAD HELPERS =====
function showImagePreview(src) {
  document.getElementById('imgPreview').src = src;
  document.getElementById('imgPreviewWrap').style.display = 'block';
  document.getElementById('imgUploadPlaceholder').style.display = 'none';
}

window.clearImage = function() {
  document.getElementById('pImageFile').value = '';
  document.getElementById('pImageUrl').value = '';
  document.getElementById('imgPreview').src = '';
  document.getElementById('imgPreviewWrap').style.display = 'none';
  document.getElementById('imgUploadPlaceholder').style.display = 'flex';
};

function initProductForm() {
  document.getElementById('addProductBtn').addEventListener('click', () => openProductModal());
  document.getElementById('closeProductModal').addEventListener('click', closeProductModal);
  document.getElementById('cancelProductModal').addEventListener('click', closeProductModal);
  document.getElementById('productModalBg').addEventListener('click', e => {
    if (e.target === document.getElementById('productModalBg')) closeProductModal();
  });
  document.getElementById('productForm').addEventListener('submit', saveProduct);

  // Image file picker
  const area = document.getElementById('imgUploadArea');
  const fileInput = document.getElementById('pImageFile');

  area.addEventListener('click', e => {
    if (e.target.closest('.clear-btn')) return;
    fileInput.click();
  });

  fileInput.addEventListener('change', function() {
    if (!this.files || !this.files[0]) return;
    const file = this.files[0];
    if (file.size > 5 * 1024 * 1024) {
      adminToast('Файл слишком большой. Максимум 5 МБ', 'error');
      this.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = e => showImagePreview(e.target.result);
    reader.readAsDataURL(file);
    document.getElementById('pImageUrl').value = '';
  });

  // Drag-and-drop
  area.addEventListener('dragover', e => { e.preventDefault(); area.classList.add('drag-over'); });
  area.addEventListener('dragleave', () => area.classList.remove('drag-over'));
  area.addEventListener('drop', e => {
    e.preventDefault();
    area.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (!file || !file.type.startsWith('image/')) return;
    if (file.size > 5 * 1024 * 1024) { adminToast('Файл слишком большой', 'error'); return; }
    // Use DataTransfer to set the file input
    const dt = new DataTransfer();
    dt.items.add(file);
    fileInput.files = dt.files;
    const reader = new FileReader();
    reader.onload = ev => showImagePreview(ev.target.result);
    reader.readAsDataURL(file);
    document.getElementById('pImageUrl').value = '';
  });
}

window.updateSizeType = function() {
  const slug = document.getElementById('pCategory').value;
  const cat = allCategories.find(c => c.slug === slug);
  if (cat) {
    document.getElementById('pSizeType').value = cat.sizeType || 'clothing';
    fillDefaultSizes();
  }
};

window.fillDefaultSizes = function() {
  const type = document.getElementById('pSizeType').value;
  const sizesField = document.getElementById('pSizes');
  if (!sizesField.value) {
    sizesField.value = SIZE_PRESETS[type] || SIZE_PRESETS.clothing;
  }
};

window.applyPreset = function(type) {
  document.getElementById('pSizeType').value = type;
  document.getElementById('pSizes').value = SIZE_PRESETS[type] || '';
};

function openProductModal(product = null) {
  document.getElementById('productForm').reset();
  window.clearImage();
  document.getElementById('colorPreviewChips').innerHTML = '';
  document.getElementById('productFormTitle').textContent = product ? 'Редактировать товар' : 'Добавить товар';

  // Populate categories dropdown
  const catSel = document.getElementById('pCategory');
  catSel.innerHTML = '<option value="">Выберите...</option>' +
    allCategories.map(c => `<option value="${esc(c.slug)}">${esc(c.name)}</option>`).join('');

  if (product) {
    document.getElementById('productId').value = product.id;
    document.getElementById('pName').value = product.name;
    catSel.value = product.category;
    document.getElementById('pPrice').value = product.price;
    document.getElementById('pOldPrice').value = product.oldPrice || '';
    document.getElementById('pDescription').value = product.description;
    document.getElementById('pSizeType').value = product.sizeType || 'clothing';
    document.getElementById('pSizes').value = (product.sizes || []).join(', ');
    const colorsStr = (product.colors || []).join(', ');
    document.getElementById('pColors').value = colorsStr;
    window.updateColorPreview(colorsStr);
    document.getElementById('pBadge').value = product.badge || '';
    document.getElementById('pRating').value = product.rating;
    document.getElementById('pReviews').value = product.reviews;
    document.getElementById('pInStock').value = product.inStock ? 'true' : 'false';
    // Show existing image
    if (product.image) {
      document.getElementById('pImageUrl').value = product.image;
      showImagePreview(product.image);
    }
  } else {
    document.getElementById('productId').value = '';
  }
  document.getElementById('productModalBg').classList.add('show');
}

window.editProduct = id => {
  const p = allProducts.find(x => x.id === id);
  if (p) openProductModal(p);
};

function closeProductModal() {
  document.getElementById('productModalBg').classList.remove('show');
}

async function saveProduct(e) {
  e.preventDefault();
  const id = document.getElementById('productId').value;
  const btn = document.getElementById('saveProductBtn');
  btn.disabled = true; btn.textContent = 'Сохранение...';

  const fd = new FormData();
  const map = { name:'pName', category:'pCategory', price:'pPrice', oldPrice:'pOldPrice',
    description:'pDescription', sizeType:'pSizeType', sizes:'pSizes', colors:'pColors',
    badge:'pBadge', rating:'pRating', reviews:'pReviews', inStock:'pInStock' };
  for (const [k, elId] of Object.entries(map)) fd.append(k, document.getElementById(elId).value);

  // Image: prefer file upload, fall back to existing URL
  const fileInput = document.getElementById('pImageFile');
  if (fileInput.files && fileInput.files[0]) {
    fd.append('image', fileInput.files[0]);
  } else {
    const existingUrl = document.getElementById('pImageUrl').value;
    if (existingUrl) fd.append('imageUrl', existingUrl);
  }

  try {
    const res = await fetch(id ? `/api/admin/products/${id}` : '/api/admin/products', {
      method: id ? 'PUT' : 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}` },
      body: fd
    });
    if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Ошибка'); }
    closeProductModal();
    adminToast(id ? 'Товар обновлён ✓' : 'Товар добавлен ✓', 'success');
    loadProductsPage();
  } catch (ex) {
    adminToast(ex.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Сохранить';
  }
}

// ===== ORDERS =====
async function loadOrdersPage() {
  try {
    allOrders = await apiFetch('/api/admin/orders');
    renderOrdersTable(allOrders);
  } catch { adminToast('Ошибка загрузки заказов', 'error'); }
}

function renderOrdersTable(orders) {
  const canEdit = ['admin','manager'].includes(currentEmployee?.role);
  const tbody = document.getElementById('ordersTableBody');
  tbody.innerHTML = orders.map(o => `
    <tr>
      <td><b class="order-id-link" onclick="showOrderDetail('${o.id}')">#${o.id}</b></td>
      <td>
        <div style="font-weight:500">${esc(o.name || '—')}</div>
        <div style="font-size:.72rem;color:var(--color-gray)">${esc(o.email || '')}</div>
      </td>
      <td>${esc(o.phone || '—')}</td>
      <td>${esc(o.city || '—')}</td>
      <td><b>${fmt(o.total)}</b></td>
      <td>${statusBadge(o.status)}</td>
      <td>${formatDate(o.createdAt)}</td>
      <td>
        ${canEdit ? `
          <select class="filter-select" style="padding:6px 10px;font-size:.76rem" onchange="updateOrderStatus(${o.id},this.value)">
            ${['new','processing','shipped','delivered','cancelled'].map(s =>
              `<option value="${s}" ${o.status===s?'selected':''}>${statusLabel(s)}</option>`
            ).join('')}
          </select>
        ` : statusBadge(o.status)}
      </td>
    </tr>
  `).join('') || '<tr><td colspan="8" style="text-align:center;color:var(--color-gray);padding:40px">Нет заказов</td></tr>';
}

async function updateOrderStatus(id, status) {
  try {
    await apiFetch(`/api/admin/orders/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
      headers: { 'Content-Type': 'application/json' }
    });
    const o = allOrders.find(x => x.id === id);
    if (o) o.status = status;
    adminToast('Статус обновлён ✓', 'success');
  } catch (ex) { adminToast(ex.message, 'error'); }
}

// ===== EMPLOYEES =====
async function loadEmployeesPage() {
  try {
    allEmployees = await apiFetch('/api/admin/employees');
    renderEmployeesTable(allEmployees);
  } catch (ex) { adminToast(ex.message, 'error'); }
}

function renderEmployeesTable(employees) {
  const tbody = document.getElementById('employeesTableBody');
  tbody.innerHTML = employees.map(emp => {
    const isLocked = emp.lockUntil && new Date(emp.lockUntil) > new Date();
    return `
      <tr class="${isLocked ? 'row-locked' : ''}">
        <td style="color:var(--color-gray)">#${emp.id}</td>
        <td>
          <div style="display:flex;align-items:center;gap:10px">
            <div class="emp-avatar" style="width:32px;height:32px;font-size:.8rem;flex-shrink:0">${(emp.name||'?')[0].toUpperCase()}</div>
            <div>
              <div style="font-weight:500">${esc(emp.name)}</div>
              <div style="font-size:.72rem;color:var(--color-gray)">${esc(emp.email || '')}</div>
            </div>
          </div>
        </td>
        <td><code style="background:var(--color-gray-light);padding:2px 8px;border-radius:4px;font-size:.8rem">${esc(emp.username)}</code></td>
        <td><span class="badge-role-${emp.role}">${roleLabel(emp.role)}</span></td>
        <td>${emp.lastLogin ? formatDate(emp.lastLogin) : '<span style="color:var(--color-gray)">Не входил</span>'}</td>
        <td>
          ${isLocked
            ? '<span class="badge badge--cancelled">🔒 Заблокирован</span>'
            : emp.active
              ? '<span class="badge badge--instock">Активен</span>'
              : '<span class="badge badge--outstock">Деактивирован</span>'
          }
        </td>
        <td>
          <div class="action-btns">
            <button class="action-btn action-btn--edit" onclick="editEmployee(${emp.id})" title="Редактировать">✏️</button>
            ${emp.id !== currentEmployee?.id
              ? `<button class="action-btn action-btn--delete" onclick="confirmDelete(${emp.id},'employee','${esc(emp.name)}')" title="Удалить">🗑️</button>`
              : `<span title="Это вы" style="color:var(--color-gray);font-size:.8rem;padding:6px">👤</span>`
            }
          </div>
        </td>
      </tr>
    `;
  }).join('') || '<tr><td colspan="7" style="text-align:center;color:var(--color-gray);padding:40px">Нет сотрудников</td></tr>';
}

// ===== EMPLOYEE FORM =====
function initEmployeeForm() {
  document.getElementById('addEmployeeBtn').addEventListener('click', () => openEmployeeModal());
  document.getElementById('employeeForm').addEventListener('submit', saveEmployee);
}

function openEmployeeModal(emp = null) {
  document.getElementById('employeeForm').reset();
  document.getElementById('employeeFormTitle').textContent = emp ? 'Редактировать сотрудника' : 'Добавить сотрудника';
  document.getElementById('employeeId').value = emp ? emp.id : '';
  document.getElementById('eActiveGroup').style.display = emp ? 'block' : 'none';
  document.getElementById('eUnlockGroup').style.display = emp ? 'block' : 'none';

  const passLabel = document.getElementById('ePasswordLabel');
  if (emp) {
    passLabel.innerHTML = 'Новый пароль <span style="color:var(--color-gray);font-weight:400;text-transform:none">(оставьте пустым — без изменений)</span>';
    document.getElementById('eName').value = emp.name;
    document.getElementById('eUsername').value = emp.username;
    document.getElementById('eRole').value = emp.role;
    document.getElementById('eEmail').value = emp.email || '';
    document.getElementById('ePhone').value = emp.phone || '';
    document.getElementById('eActive').value = emp.active ? 'true' : 'false';
  } else {
    passLabel.innerHTML = 'Пароль * <span style="color:var(--color-gray);font-weight:400;text-transform:none">(мин. 6 символов)</span>';
  }
  document.getElementById('employeeModalBg').classList.add('show');
}

window.editEmployee = async id => {
  const emp = allEmployees.find(x => x.id === id);
  if (emp) openEmployeeModal(emp);
};

window.closeEmployeeModal = () => {
  document.getElementById('employeeModalBg').classList.remove('show');
};

async function saveEmployee(e) {
  e.preventDefault();
  const id = document.getElementById('employeeId').value;
  const body = {
    name: document.getElementById('eName').value,
    username: document.getElementById('eUsername').value,
    password: document.getElementById('ePassword').value || undefined,
    role: document.getElementById('eRole').value,
    email: document.getElementById('eEmail').value,
    phone: document.getElementById('ePhone').value,
  };
  if (id) {
    body.active = document.getElementById('eActive').value;
    body.unlock = document.getElementById('eUnlock').checked;
  }
  if (!id && !body.password) {
    adminToast('Введите пароль', 'error'); return;
  }

  try {
    await apiFetch(id ? `/api/admin/employees/${id}` : '/api/admin/employees', {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' }
    });
    window.closeEmployeeModal();
    adminToast(id ? 'Сотрудник обновлён ✓' : 'Сотрудник добавлен ✓', 'success');
    loadEmployeesPage();
  } catch (ex) { adminToast(ex.message, 'error'); }
}

// ===== CHANGE PASSWORD =====
function initChangePassForm() {
  document.getElementById('changePassForm').addEventListener('submit', async e => {
    e.preventDefault();
    const errEl = document.getElementById('cpError');
    const btn = document.getElementById('cpBtn');
    errEl.textContent = '';

    const currentPassword = document.getElementById('cpCurrent').value;
    const newPassword = document.getElementById('cpNew').value;
    const confirm = document.getElementById('cpConfirm').value;

    if (newPassword.length < 6) {
      errEl.textContent = 'Новый пароль — минимум 6 символов';
      return;
    }
    if (newPassword !== confirm) {
      errEl.textContent = 'Новый пароль и подтверждение не совпадают';
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Сохранение...';
    try {
      await apiFetch('/api/admin/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
        headers: { 'Content-Type': 'application/json' }
      });
      document.getElementById('changePassForm').reset();
      adminToast('Пароль успешно изменён ✓', 'success');
    } catch (ex) {
      errEl.textContent = ex.message || 'Ошибка';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Изменить пароль';
    }
  });
}

window.toggleCpPass = id => {
  const inp = document.getElementById(id);
  inp.type = inp.type === 'password' ? 'text' : 'password';
};

// ===== AUDIT =====
async function loadAuditPage() {
  try {
    const entries = await apiFetch('/api/admin/audit');
    const ACTION_LABELS = {
      login_success: '✅ Успешный вход',
      login_failed_password: '⚠️ Неверный пароль',
      login_failed_unknown: '⚠️ Неизвестный пользователь',
      login_account_locked: '🔒 Аккаунт заблокирован',
      login_blocked: '🚫 Вход заблокирован',
      logout: '👋 Выход',
    };
    const tbody = document.getElementById('auditTableBody');
    tbody.innerHTML = entries.map(e => {
      const label = ACTION_LABELS[e.action] || e.action.replace(/_/g, ' ');
      const isWarn = e.action.includes('fail') || e.action.includes('block') || e.action.includes('lock');
      return `
        <tr style="${isWarn ? 'background:#fff8f8' : ''}">
          <td style="white-space:nowrap">${formatDate(e.timestamp)}</td>
          <td><code style="background:var(--color-gray-light);padding:2px 8px;border-radius:4px">${esc(e.username)}</code></td>
          <td>${esc(label)}</td>
          <td style="font-family:monospace;font-size:.78rem;color:var(--color-gray)">${esc(e.ip)}</td>
        </tr>
      `;
    }).join('') || '<tr><td colspan="4" style="text-align:center;color:var(--color-gray);padding:40px">Нет записей</td></tr>';
  } catch (ex) { adminToast(ex.message, 'error'); }
}

// ===== DELETE =====
function initDeleteModal() {
  document.getElementById('confirmDeleteBtn').addEventListener('click', async () => {
    try {
      if (deleteType === 'product') {
        await apiFetch(`/api/admin/products/${deleteTarget}`, { method: 'DELETE' });
        adminToast('Товар удалён', 'success');
        loadProductsPage();
      } else if (deleteType === 'employee') {
        await apiFetch(`/api/admin/employees/${deleteTarget}`, { method: 'DELETE' });
        adminToast('Сотрудник удалён', 'success');
        loadEmployeesPage();
      } else if (deleteType === 'category') {
        await apiFetch(`/api/admin/categories/${deleteTarget}`, { method: 'DELETE' });
        adminToast('Категория удалена', 'success');
        await loadCategories();
        loadCategoriesPage();
      }
      closeDeleteModal();
    } catch (ex) { adminToast(ex.message, 'error'); }
  });
}

window.confirmDelete = (id, type, name) => {
  deleteTarget = id; deleteType = type;
  document.getElementById('deleteConfirmText').textContent =
    `Удалить «${name}»? Это действие нельзя отменить.`;
  document.getElementById('confirmDeleteBg').classList.add('show');
};
window.closeDeleteModal = () => {
  document.getElementById('confirmDeleteBg').classList.remove('show');
  deleteTarget = null; deleteType = '';
};

// ===== SEARCHES =====
function initSearches() {
  document.getElementById('productSearch').addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    renderProductsTable(allProducts.filter(p =>
      p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)
    ));
  });
  document.getElementById('orderSearch').addEventListener('input', filterOrders);
  document.getElementById('orderStatusFilter').addEventListener('change', filterOrders);
  document.getElementById('employeeSearch').addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    renderEmployeesTable(allEmployees.filter(emp =>
      emp.name.toLowerCase().includes(q) || emp.username.toLowerCase().includes(q)
    ));
  });
  document.getElementById('returnSearch').addEventListener('input', filterReturns);
  document.getElementById('returnStatusFilter').addEventListener('change', filterReturns);
  document.getElementById('categorySearch').addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    renderCategoriesTable(allCategories.filter(c =>
      c.name.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q)
    ));
  });
}

function filterOrders() {
  const q = document.getElementById('orderSearch').value.toLowerCase();
  const s = document.getElementById('orderStatusFilter').value;
  let orders = allOrders;
  if (q) orders = orders.filter(o => (o.name||'').toLowerCase().includes(q) || (o.email||'').toLowerCase().includes(q) || (o.phone||'').includes(q));
  if (s) orders = orders.filter(o => o.status === s);
  renderOrdersTable(orders);
}

// ===== RETURNS =====
const RETURN_REASONS = {
  wrong_size: 'Не подошёл размер',
  defect: 'Брак / дефект',
  not_as_described: 'Не соответствует описанию',
  changed_mind: 'Передумала',
  wrong_item: 'Прислали не тот товар',
  other: 'Другая причина',
};
const RETURN_RESOLUTIONS = {
  refund: '💳 Возврат денег',
  exchange: '🔄 Обмен',
  certificate: '🎁 Сертификат',
};
const RETURN_STATUSES = {
  new: { label: 'Новая', cls: 'badge--new' },
  processing: { label: 'В работе', cls: 'badge--processing' },
  resolved: { label: 'Решено', cls: 'badge--instock' },
  rejected: { label: 'Отклонено', cls: 'badge--cancelled' },
};

async function loadReturnsPage() {
  try {
    allReturns = await apiFetch('/api/admin/returns');
    renderReturnsTable(allReturns);
  } catch (ex) { adminToast(ex.message, 'error'); }
}

function renderReturnsTable(returns) {
  const canEdit = ['admin', 'manager'].includes(currentEmployee?.role);
  const tbody = document.getElementById('returnsTableBody');
  if (!returns.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--color-gray);padding:40px">Заявок на возврат пока нет</td></tr>';
    return;
  }
  tbody.innerHTML = returns.map(r => {
    const st = RETURN_STATUSES[r.status] || RETURN_STATUSES.new;
    return `
      <tr>
        <td style="color:var(--color-gray);font-size:.78rem">#${r.id}<br><span style="font-size:.7rem">${formatDate(r.createdAt)}</span></td>
        <td>
          <div style="font-weight:500">${esc(r.name)}</div>
          <div style="font-size:.72rem;color:var(--color-gray)">${esc(r.phone)}</div>
          ${r.email ? `<div style="font-size:.72rem;color:var(--color-gray)">${esc(r.email)}</div>` : ''}
        </td>
        <td>
          <div style="font-weight:500;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.product || '—')}</div>
          ${r.size ? `<div style="font-size:.72rem;color:var(--color-gray)">Размер: ${esc(r.size)}</div>` : ''}
          ${r.orderId ? `<div style="font-size:.72rem;color:var(--color-gray)">Заказ: ${esc(r.orderId)}</div>` : ''}
        </td>
        <td style="font-size:.82rem">${esc(RETURN_REASONS[r.reason] || r.reason)}</td>
        <td style="font-size:.82rem">${esc(RETURN_RESOLUTIONS[r.resolution] || r.resolution)}</td>
        <td>
          ${canEdit ? `
            <select class="filter-select" style="padding:5px 8px;font-size:.75rem" onchange="updateReturnStatus(${r.id},this.value)">
              ${Object.entries(RETURN_STATUSES).map(([val, {label}]) =>
                `<option value="${val}" ${r.status===val?'selected':''}>${label}</option>`
              ).join('')}
            </select>
          ` : `<span class="badge ${st.cls}">${st.label}</span>`}
        </td>
        <td style="font-size:.78rem;color:var(--color-gray)">${formatDate(r.createdAt)}</td>
        <td>
          <button class="action-btn action-btn--edit" onclick="openReturnDetail(${r.id})" title="Подробнее">👁️</button>
        </td>
      </tr>
    `;
  }).join('');
}

function filterReturns() {
  const q = document.getElementById('returnSearch').value.toLowerCase();
  const s = document.getElementById('returnStatusFilter').value;
  let list = allReturns;
  if (q) list = list.filter(r =>
    (r.name||'').toLowerCase().includes(q) ||
    (r.phone||'').includes(q) ||
    (r.product||'').toLowerCase().includes(q) ||
    (r.orderId||'').includes(q)
  );
  if (s) list = list.filter(r => r.status === s);
  renderReturnsTable(list);
}

async function updateReturnStatus(id, status) {
  try {
    await apiFetch(`/api/admin/returns/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
      headers: { 'Content-Type': 'application/json' }
    });
    const r = allReturns.find(x => x.id === id);
    if (r) r.status = status;
    adminToast('Статус обновлён ✓', 'success');
  } catch (ex) { adminToast(ex.message, 'error'); }
}

window.openReturnDetail = id => {
  const r = allReturns.find(x => x.id === id);
  if (!r) return;
  const st = RETURN_STATUSES[r.status] || RETURN_STATUSES.new;
  document.getElementById('returnDetailBody').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:14px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:.72rem;color:var(--color-gray)">ID: ${r.id}</span>
        <span class="badge ${st.cls}">${st.label}</span>
      </div>
      <div class="detail-section">
        <div class="detail-label">Клиент</div>
        <div class="detail-value">${esc(r.name)}</div>
        <div class="detail-value" style="font-size:.82rem;color:var(--color-gray)">${esc(r.phone)}${r.email ? ' · ' + esc(r.email) : ''}</div>
      </div>
      ${r.orderId ? `<div class="detail-section"><div class="detail-label">Номер заказа</div><div class="detail-value">${esc(r.orderId)}</div></div>` : ''}
      <div class="detail-section">
        <div class="detail-label">Товар</div>
        <div class="detail-value">${esc(r.product || '—')}${r.size ? ` · Размер: ${esc(r.size)}` : ''}</div>
      </div>
      <div class="detail-section">
        <div class="detail-label">Причина</div>
        <div class="detail-value">${esc(RETURN_REASONS[r.reason] || r.reason)}</div>
        ${r.description ? `<div style="font-size:.83rem;color:var(--color-gray);margin-top:6px;line-height:1.6">${esc(r.description)}</div>` : ''}
      </div>
      <div class="detail-section">
        <div class="detail-label">Желаемое решение</div>
        <div class="detail-value">${esc(RETURN_RESOLUTIONS[r.resolution] || r.resolution)}</div>
        ${r.bankDetail ? `<div style="font-size:.83rem;color:var(--color-gray);margin-top:4px">Реквизиты: <b>${esc(r.bankDetail)}</b></div>` : ''}
      </div>
      <div style="font-size:.75rem;color:var(--color-gray);border-top:1px solid var(--color-border);padding-top:12px">
        Подана: ${formatDate(r.createdAt)}${r.updatedAt ? ' · Обновлена: ' + formatDate(r.updatedAt) : ''}
      </div>
    </div>
  `;
  document.getElementById('returnDetailBg').classList.add('show');
};

window.closeReturnDetail = () => {
  document.getElementById('returnDetailBg').classList.remove('show');
};

// ===== ORDER DETAIL =====
window.showOrderDetail = function(idStr) {
  const id = Number(idStr);
  const o = allOrders.find(function(x) { return x.id === id; });
  if (!o) { alert('Заказ не найден (id=' + idStr + ')'); return; }
  renderOrderDetail(o);
};

function renderOrderDetail(o) {
  document.getElementById('orderDetailTitle').textContent = `Заказ #${o.id}`;

  const itemsRows = (o.items || []).map(it => {
    const colorDot = it.color
      ? `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${esc(it.color)};border:1px solid #ccc;margin-right:4px;vertical-align:middle"></span>`
      : '';
    const size = it.size ? `<span style="color:var(--color-gray);font-size:.75rem"> · ${esc(it.size)}</span>` : '';
    return `
      <tr>
        <td style="font-size:.85rem;padding:6px 0">${colorDot}${esc(it.name || '—')}${size}</td>
        <td style="text-align:center;font-size:.85rem;padding:6px">${it.qty || 1}</td>
        <td style="text-align:right;font-size:.85rem;white-space:nowrap;padding:6px 0">${fmt(it.price)}</td>
        <td style="text-align:right;font-size:.85rem;font-weight:600;white-space:nowrap;padding:6px 0">${fmt((it.price || 0) * (it.qty || 1))}</td>
      </tr>
    `;
  }).join('') || `<tr><td colspan="4" style="color:var(--color-gray);font-size:.82rem;padding:8px 0">Нет данных о товарах</td></tr>`;

  document.getElementById('orderDetailBody').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:14px">

      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
        <span style="font-size:.75rem;color:var(--color-gray)">${formatDate(o.createdAt)}</span>
        ${statusBadge(o.status)}
      </div>

      <div class="detail-section">
        <div class="detail-label">Покупатель</div>
        <div class="detail-value">${esc(o.name || '—')}</div>
        <div style="display:flex;flex-wrap:wrap;gap:16px;margin-top:6px">
          ${o.phone ? `<a href="tel:${esc(o.phone)}" style="font-size:.83rem;color:var(--color-primary);text-decoration:none">📞 ${esc(o.phone)}</a>` : ''}
          ${o.email ? `<a href="mailto:${esc(o.email)}" style="font-size:.83rem;color:var(--color-primary);text-decoration:none">✉️ ${esc(o.email)}</a>` : ''}
        </div>
      </div>

      <div class="detail-section">
        <div class="detail-label">Адрес доставки</div>
        <div class="detail-value">${esc(o.city || '—')}${o.address ? `, ${esc(o.address)}` : ''}</div>
      </div>

      ${o.comment ? `
      <div class="detail-section">
        <div class="detail-label">Комментарий</div>
        <div style="font-size:.85rem;line-height:1.6;color:#444">${esc(o.comment)}</div>
      </div>` : ''}

      <div class="detail-section">
        <div class="detail-label">Состав заказа</div>
        <div style="margin-top:8px;overflow-x:auto">
          <table style="width:100%;border-collapse:collapse">
            <thead>
              <tr style="border-bottom:1px solid var(--color-border)">
                <th style="text-align:left;font-size:.72rem;font-weight:600;color:var(--color-gray);padding:4px 0;text-transform:uppercase;letter-spacing:.06em">Товар</th>
                <th style="text-align:center;font-size:.72rem;font-weight:600;color:var(--color-gray);padding:4px 6px;text-transform:uppercase;letter-spacing:.06em">Кол-во</th>
                <th style="text-align:right;font-size:.72rem;font-weight:600;color:var(--color-gray);padding:4px 0;text-transform:uppercase;letter-spacing:.06em">Цена</th>
                <th style="text-align:right;font-size:.72rem;font-weight:600;color:var(--color-gray);padding:4px 0;text-transform:uppercase;letter-spacing:.06em">Итого</th>
              </tr>
            </thead>
            <tbody style="border-bottom:1px solid var(--color-border)">${itemsRows}</tbody>
          </table>
        </div>
        <div style="display:flex;justify-content:flex-end;margin-top:10px;padding-top:8px;border-top:2px solid var(--color-border)">
          <span style="font-size:1rem;font-weight:700">Итого: ${fmt(o.total)}</span>
        </div>
      </div>

    </div>
  `;
  document.getElementById('orderDetailBg').classList.add('show');
}

window.closeOrderDetail = () => {
  document.getElementById('orderDetailBg').classList.remove('show');
};

// ===== CATEGORIES =====
async function loadCategories() {
  try {
    allCategories = await apiFetch('/api/admin/categories');
  } catch { /* silent — non-critical on first load */ }
}

async function loadCategoriesPage() {
  try {
    allCategories = await apiFetch('/api/admin/categories');
    renderCategoriesTable(allCategories);
  } catch (ex) { adminToast(ex.message, 'error'); }
}

function renderCategoriesTable(categories) {
  const SIZE_TYPE_LABELS = { clothing:'Одежда', bra:'Бюстгальтер', hosiery:'Чулочные' };
  const tbody = document.getElementById('categoriesTableBody');
  tbody.innerHTML = categories.map(c => `
    <tr>
      <td style="color:var(--color-gray)">#${c.id}</td>
      <td><b>${esc(c.name)}</b></td>
      <td><code style="background:var(--color-gray-light);padding:2px 8px;border-radius:4px;font-size:.8rem">${esc(c.slug)}</code></td>
      <td>${esc(SIZE_TYPE_LABELS[c.sizeType] || c.sizeType)}</td>
      <td>
        <div class="action-btns">
          <button class="action-btn action-btn--edit" onclick="editCategory(${c.id})" title="Редактировать">✏️</button>
          <button class="action-btn action-btn--delete" onclick="confirmDeleteCategory(${c.id},'${esc(c.name)}')" title="Удалить">🗑️</button>
        </div>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--color-gray);padding:40px">Нет категорий</td></tr>';
}

function initCategoryForm() {
  document.getElementById('addCategoryBtn').addEventListener('click', () => openCategoryModal());
  document.getElementById('categoryForm').addEventListener('submit', saveCategory);
}

function openCategoryModal(cat = null) {
  document.getElementById('categoryForm').reset();
  document.getElementById('categoryFormTitle').textContent = cat ? 'Редактировать категорию' : 'Добавить категорию';
  document.getElementById('categoryId').value = cat ? cat.id : '';
  if (cat) {
    document.getElementById('cName').value = cat.name;
    document.getElementById('cSizeType').value = cat.sizeType || 'clothing';
  }
  document.getElementById('categoryModalBg').classList.add('show');
}

window.editCategory = id => {
  const c = allCategories.find(x => x.id === id);
  if (c) openCategoryModal(c);
};

window.closeCategoryModal = () => {
  document.getElementById('categoryModalBg').classList.remove('show');
};

async function saveCategory(e) {
  e.preventDefault();
  const id = document.getElementById('categoryId').value;
  const body = {
    name: document.getElementById('cName').value,
    sizeType: document.getElementById('cSizeType').value,
  };
  try {
    await apiFetch(id ? `/api/admin/categories/${id}` : '/api/admin/categories', {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' }
    });
    window.closeCategoryModal();
    adminToast(id ? 'Категория обновлена ✓' : 'Категория добавлена ✓', 'success');
    await loadCategories();
    loadCategoriesPage();
  } catch (ex) { adminToast(ex.message, 'error'); }
}

window.confirmDeleteCategory = (id, name) => {
  deleteTarget = id; deleteType = 'category';
  document.getElementById('deleteConfirmText').textContent =
    `Удалить категорию «${name}»? Это действие нельзя отменить.`;
  document.getElementById('confirmDeleteBg').classList.add('show');
};

// ===== HELPERS =====
function roleLabel(r) {
  return { admin:'Администратор', manager:'Менеджер', viewer:'Сотрудник' }[r] || r;
}

function statusLabel(s) {
  return { new:'Новый', processing:'В обработке', shipped:'Отправлен', delivered:'Доставлен', cancelled:'Отменён' }[s] || s;
}

function statusBadge(s) {
  return `<span class="badge badge--${s||'new'}">${statusLabel(s)}</span>`;
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('ru-KZ', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' });
}

function adminToast(msg, type = '') {
  const t = document.getElementById('adminToast');
  t.textContent = msg;
  t.className = `admin-toast ${type} show`;
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('show'), 3500);
}

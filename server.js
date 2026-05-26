const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'lora_kz_2024_v2_secure_jwt_secret_key_!!';
const SALT_ROUNDS = 12;

// ===== SECURITY MIDDLEWARE =====
// Helmet: X-Frame-Options, X-XSS-Protection, X-Content-Type-Options, HSTS, etc.
app.use(helmet({
  contentSecurityPolicy: false, // inline handlers in HTML
  crossOriginEmbedderPolicy: false,
}));

// Rate limiting: login — max 5 tries per 15 min per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Слишком много попыток входа. Попробуйте через 15 минут.' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
});

// General API limiter: 300 req/min per IP
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', apiLimiter);
app.use('/api/admin/login', loginLimiter);
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// ===== INPUT SANITIZATION (XSS prevention) =====
function sanitize(val) {
  if (typeof val !== 'string') return val;
  return val.replace(/[<>"'`]/g, c => ({ '<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#x27;','`':'&#x60;' }[c]));
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePhone(phone) {
  return /^\+?[0-9\s\-().]{7,20}$/.test(phone);
}

// ===== FILE UPLOAD =====
const ALLOWED_MIME = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, 'public', 'images', 'products');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    if (!ALLOWED_MIME.includes(file.mimetype)) return cb(new Error('Недопустимый тип файла'));
    const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z]/g, '');
    cb(null, `prod_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME.includes(file.mimetype)) return cb(new Error('Только JPEG, PNG, WEBP'));
    cb(null, true);
  }
});

// ===== DATA FILES =====
const DATA_DIR = path.join(__dirname, 'data');
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');
const EMPLOYEES_FILE = path.join(DATA_DIR, 'employees.json');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const AUDIT_FILE = path.join(DATA_DIR, 'audit.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function readJSON(file) {
  try {
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch { return null; }
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

// ===== DEFAULT PRODUCTS (KZT v2) =====
const DEFAULT_PRODUCTS = [
  { id:1, v:2, name:"Шёлковый комплект «Роза»", price:14900, oldPrice:19900, category:"sets",
    description:"Роскошный комплект из натурального шёлка. Нежная отделка французским кружевом придаёт изысканный вид. Бюстгальтер и трусики в комплекте.",
    image:"/images/default/p1.jpg", sizes:["70B","70C","75B","75C","75D","80B","80C","80D"],
    colors:["#f4b8c8","#fff","#1a1a2e"], badge:"Хит продаж", inStock:true, rating:4.8, reviews:124, sizeType:"bra" },
  { id:2, v:2, name:"Кружевной бюстгальтер «Нуар»", price:8500, oldPrice:null, category:"bras",
    description:"Изящный бюстгальтер из французского кружева. Анатомические чашки создают идеальный силуэт и обеспечивают комфорт на весь день.",
    image:"/images/default/p2.jpg", sizes:["70A","70B","70C","75A","75B","75C","75D","80B","80C","80D","85B","85C"],
    colors:["#1a1a2e","#f4b8c8"], badge:null, inStock:true, rating:4.6, reviews:87, sizeType:"bra" },
  { id:3, v:2, name:"Боди «Соблазн»", price:18900, oldPrice:24900, category:"bodies",
    description:"Элегантное боди с глубоким вырезом и кружевными вставками. Идеально для особых случаев. Застёжка на кнопках.",
    image:"/images/default/p3.jpg", sizes:["XS","S","M","L","XL"],
    colors:["#1a1a2e","#fff","#c9a96e"], badge:"Новинка", inStock:true, rating:4.9, reviews:56, sizeType:"clothing" },
  { id:4, v:2, name:"Трусики «Пион»", price:3900, oldPrice:null, category:"panties",
    description:"Нежные трусики из микрофибры с кружевной отделкой. Бесшовный крой. Максимальный комфорт для каждого дня.",
    image:"/images/default/p4.jpg", sizes:["XS","S","M","L","XL","XXL"],
    colors:["#f4b8c8","#c9a96e","#1a1a2e"], badge:null, inStock:true, rating:4.5, reviews:203, sizeType:"clothing" },
  { id:5, v:2, name:"Пеньюар «Мечта»", price:24900, oldPrice:32000, category:"nightwear",
    description:"Воздушный пеньюар из шифона с кружевным лифом. Длина макси. Создаёт незабываемое романтическое настроение.",
    image:"/images/default/p5.jpg", sizes:["S","M","L","XL","XXL"],
    colors:["#f4b8c8","#fff"], badge:"Бестселлер", inStock:true, rating:4.7, reviews:91, sizeType:"clothing" },
  { id:6, v:2, name:"Корсет «Версаль»", price:34900, oldPrice:null, category:"corsets",
    description:"Роскошный корсет со стальными косточками и атласными лентами. Подчёркивает талию. Ручная работа, эксклюзивное исполнение.",
    image:"/images/default/p6.jpg", sizes:["XS","S","M","L","XL"],
    colors:["#1a1a2e","#c9a96e"], badge:"Эксклюзив", inStock:true, rating:4.9, reviews:42, sizeType:"clothing" },
  { id:7, v:2, name:"Комплект «Жасмин»", price:12900, oldPrice:16500, category:"sets",
    description:"Нежный комплект с цветочным принтом. Мягкая микрофибра для ежедневного комфорта. Включает бюстгальтер и трусики.",
    image:"/images/default/p7.jpg", sizes:["70A","70B","75A","75B","75C","80B","80C"],
    colors:["#f4b8c8","#fff"], badge:null, inStock:true, rating:4.4, reviews:168, sizeType:"bra" },
  { id:8, v:2, name:"Пижама «Луна»", price:19900, oldPrice:25900, category:"nightwear",
    description:"Шёлковая пижама с изысканным кружевным воротником. Включает рубашку и брюки. Роскошь каждую ночь.",
    image:"/images/default/p8.jpg", sizes:["S","M","L","XL","XXL"],
    colors:["#c9a96e","#f4b8c8","#1a1a2e"], badge:"Скидка", inStock:true, rating:4.6, reviews:77, sizeType:"clothing" }
];

// Initialize or migrate products to v2
const existingProducts = readJSON(PRODUCTS_FILE);
if (!existingProducts || !existingProducts[0] || existingProducts[0].v !== 2) {
  writeJSON(PRODUCTS_FILE, DEFAULT_PRODUCTS);
}

// Initialize employees (replaces old admin.json)
if (!readJSON(EMPLOYEES_FILE)) {
  const employees = [
    { id:1, username:'admin', password:bcrypt.hashSync('admin123', SALT_ROUNDS),
      name:'Главный администратор', role:'admin', email:'admin@lora.kz',
      phone:'+7 (727) 000-00-01', active:true, failedAttempts:0, lockUntil:null,
      lastLogin:null, createdAt: new Date().toISOString() },
    { id:2, username:'manager', password:bcrypt.hashSync('manager123', SALT_ROUNDS),
      name:'Менеджер', role:'manager', email:'manager@lora.kz',
      phone:'+7 (727) 000-00-02', active:true, failedAttempts:0, lockUntil:null,
      lastLogin:null, createdAt: new Date().toISOString() },
    { id:3, username:'staff', password:bcrypt.hashSync('staff123', SALT_ROUNDS),
      name:'Сотрудник', role:'viewer', email:'staff@lora.kz',
      phone:'+7 (727) 000-00-03', active:true, failedAttempts:0, lockUntil:null,
      lastLogin:null, createdAt: new Date().toISOString() },
  ];
  writeJSON(EMPLOYEES_FILE, employees);
}

if (!readJSON(ORDERS_FILE)) writeJSON(ORDERS_FILE, []);
if (!readJSON(AUDIT_FILE)) writeJSON(AUDIT_FILE, []);

// ===== AUDIT LOG =====
function auditLog(username, action, req) {
  const entries = readJSON(AUDIT_FILE) || [];
  entries.unshift({
    timestamp: new Date().toISOString(),
    username: sanitize(username),
    action,
    ip: req.ip || req.connection?.remoteAddress || 'unknown',
    userAgent: (req.headers['user-agent'] || '').substring(0, 120)
  });
  writeJSON(AUDIT_FILE, entries.slice(0, 500));
}

// ===== JWT BLACKLIST (in-memory, clears on restart) =====
const tokenBlacklist = new Set();

// ===== AUTH MIDDLEWARE =====
function authMiddleware(req, res, next) {
  const token = req.cookies.adminToken || req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Не авторизован' });
  if (tokenBlacklist.has(token)) return res.status(401).json({ error: 'Сессия завершена' });
  try {
    req.employee = jwt.verify(token, JWT_SECRET);
    req.token = token;
    next();
  } catch {
    res.status(401).json({ error: 'Недействительный токен' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.employee?.role)) {
      auditLog(req.employee?.username || 'unknown', `forbidden_${req.method}_${req.path}`, req);
      return res.status(403).json({ error: 'Недостаточно прав доступа' });
    }
    next();
  };
}

// ===== PUBLIC API =====
app.get('/api/products', (req, res) => {
  const products = readJSON(PRODUCTS_FILE) || [];
  const { category, search, sort } = req.query;
  let result = [...products];
  if (category && category !== 'all') result = result.filter(p => p.category === category);
  if (search) {
    const q = sanitize(search).toLowerCase();
    result = result.filter(p => p.name.toLowerCase().includes(q));
  }
  if (sort === 'price_asc') result.sort((a, b) => a.price - b.price);
  else if (sort === 'price_desc') result.sort((a, b) => b.price - a.price);
  else if (sort === 'rating') result.sort((a, b) => b.rating - a.rating);
  res.json(result);
});

app.get('/api/products/:id', (req, res) => {
  const products = readJSON(PRODUCTS_FILE) || [];
  const product = products.find(p => p.id === parseInt(req.params.id));
  if (!product) return res.status(404).json({ error: 'Не найдено' });
  res.json(product);
});

app.post('/api/orders', (req, res) => {
  const { name, phone, email, address, city, comment, items, total } = req.body;
  // Validate required fields
  if (!name || !phone || !email || !address || !city) {
    return res.status(400).json({ error: 'Заполните все обязательные поля' });
  }
  if (!validateEmail(email)) return res.status(400).json({ error: 'Неверный формат email' });
  if (!validatePhone(phone)) return res.status(400).json({ error: 'Неверный формат телефона' });
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Корзина пуста' });
  }

  const orders = readJSON(ORDERS_FILE) || [];
  const order = {
    id: Date.now(),
    name: sanitize(String(name).trim()),
    phone: sanitize(String(phone).trim()),
    email: sanitize(String(email).trim().toLowerCase()),
    address: sanitize(String(address).trim()),
    city: sanitize(String(city).trim()),
    comment: comment ? sanitize(String(comment).trim().substring(0, 500)) : '',
    items: items.slice(0, 50).map(it => ({
      id: parseInt(it.id) || 0,
      name: sanitize(String(it.name || '')),
      price: Math.abs(parseFloat(it.price) || 0),
      qty: Math.min(Math.abs(parseInt(it.qty) || 1), 99),
      size: sanitize(String(it.size || '')),
      color: sanitize(String(it.color || ''))
    })),
    total: Math.abs(parseFloat(total) || 0),
    status: 'new',
    createdAt: new Date().toISOString()
  };
  orders.unshift(order);
  writeJSON(ORDERS_FILE, orders);
  res.json({ success: true, orderId: order.id });
});

// ===== ADMIN AUTH =====
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Введите логин и пароль' });
  }

  const employees = readJSON(EMPLOYEES_FILE) || [];
  const emp = employees.find(e => e.username === String(username).trim());

  // Generic error — don't reveal if user exists
  const FAIL_MSG = 'Неверный логин или пароль';

  if (!emp || !emp.active) {
    auditLog(username, 'login_failed_unknown', req);
    return res.status(401).json({ error: FAIL_MSG });
  }

  // Check account lockout
  if (emp.lockUntil && new Date(emp.lockUntil) > new Date()) {
    const remaining = Math.ceil((new Date(emp.lockUntil) - new Date()) / 60000);
    auditLog(username, 'login_blocked', req);
    return res.status(403).json({ error: `Аккаунт заблокирован. Осталось ${remaining} мин.` });
  }

  if (!bcrypt.compareSync(String(password), emp.password)) {
    emp.failedAttempts = (emp.failedAttempts || 0) + 1;
    if (emp.failedAttempts >= 5) {
      emp.lockUntil = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      emp.failedAttempts = 0;
      auditLog(username, 'login_account_locked', req);
      writeJSON(EMPLOYEES_FILE, employees);
      return res.status(403).json({ error: 'Слишком много неудачных попыток. Аккаунт заблокирован на 30 минут.' });
    }
    writeJSON(EMPLOYEES_FILE, employees);
    auditLog(username, 'login_failed_password', req);
    return res.status(401).json({ error: FAIL_MSG });
  }

  // Success
  emp.failedAttempts = 0;
  emp.lockUntil = null;
  emp.lastLogin = new Date().toISOString();
  writeJSON(EMPLOYEES_FILE, employees);

  const payload = { id: emp.id, username: emp.username, name: emp.name, role: emp.role };
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '10h' });
  res.cookie('adminToken', token, { httpOnly: true, sameSite: 'strict', maxAge: 36000000 });
  auditLog(username, 'login_success', req);
  res.json({ success: true, token, employee: { name: emp.name, role: emp.role, username: emp.username } });
});

app.post('/api/admin/logout', authMiddleware, (req, res) => {
  tokenBlacklist.add(req.token);
  res.clearCookie('adminToken');
  auditLog(req.employee.username, 'logout', req);
  res.json({ success: true });
});

app.get('/api/admin/check', authMiddleware, (req, res) => {
  res.json({ success: true, employee: req.employee });
});

// ===== ADMIN PRODUCTS (admin + manager) =====
const canEditProducts = [authMiddleware, requireRole('admin', 'manager')];
const canViewAdmin = [authMiddleware, requireRole('admin', 'manager', 'viewer')];

app.get('/api/admin/products', ...canViewAdmin, (req, res) => {
  res.json(readJSON(PRODUCTS_FILE) || []);
});

app.post('/api/admin/products', ...canEditProducts, upload.single('image'), (req, res) => {
  const products = readJSON(PRODUCTS_FILE) || [];
  const newId = products.length > 0 ? Math.max(...products.map(p => p.id)) + 1 : 1;
  const b = req.body;

  if (!b.name || !b.category || !b.price) {
    return res.status(400).json({ error: 'Название, категория и цена обязательны' });
  }

  const product = {
    id: newId, v: 2,
    name: sanitize(String(b.name).trim()),
    price: Math.abs(parseFloat(b.price)) || 0,
    oldPrice: b.oldPrice ? Math.abs(parseFloat(b.oldPrice)) : null,
    category: sanitize(String(b.category || '').trim()),
    description: sanitize(String(b.description || '').trim()),
    image: req.file ? `/images/products/${req.file.filename}` : sanitize(String(b.imageUrl || '/images/default/p1.jpg')),
    sizes: b.sizes ? b.sizes.split(',').map(s => sanitize(s.trim())).filter(Boolean) : [],
    colors: b.colors ? b.colors.split(',').map(c => sanitize(c.trim())).filter(Boolean) : [],
    badge: b.badge ? sanitize(String(b.badge).trim()) : null,
    inStock: b.inStock === 'true' || b.inStock === true,
    rating: Math.min(5, Math.max(1, parseFloat(b.rating) || 5.0)),
    reviews: Math.abs(parseInt(b.reviews) || 0),
    sizeType: b.sizeType === 'bra' ? 'bra' : 'clothing'
  };

  products.push(product);
  writeJSON(PRODUCTS_FILE, products);
  auditLog(req.employee.username, `product_created_${product.id}`, req);
  res.json(product);
});

app.put('/api/admin/products/:id', ...canEditProducts, upload.single('image'), (req, res) => {
  const products = readJSON(PRODUCTS_FILE) || [];
  const idx = products.findIndex(p => p.id === parseInt(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Не найдено' });
  const b = req.body;

  products[idx] = {
    ...products[idx], v: 2,
    name: sanitize(String(b.name || products[idx].name).trim()),
    price: Math.abs(parseFloat(b.price) || products[idx].price),
    oldPrice: b.oldPrice ? Math.abs(parseFloat(b.oldPrice)) : null,
    category: sanitize(String(b.category || '').trim()) || products[idx].category,
    description: sanitize(String(b.description || products[idx].description).trim()),
    image: req.file ? `/images/products/${req.file.filename}` : (b.imageUrl ? sanitize(b.imageUrl) : products[idx].image),
    sizes: b.sizes ? b.sizes.split(',').map(s => sanitize(s.trim())).filter(Boolean) : products[idx].sizes,
    colors: b.colors ? b.colors.split(',').map(c => sanitize(c.trim())).filter(Boolean) : products[idx].colors,
    badge: b.badge ? sanitize(String(b.badge).trim()) : null,
    inStock: b.inStock === 'true' || b.inStock === true,
    rating: Math.min(5, Math.max(1, parseFloat(b.rating) || products[idx].rating)),
    reviews: Math.abs(parseInt(b.reviews) || products[idx].reviews),
    sizeType: b.sizeType === 'bra' ? 'bra' : 'clothing'
  };

  writeJSON(PRODUCTS_FILE, products);
  auditLog(req.employee.username, `product_updated_${products[idx].id}`, req);
  res.json(products[idx]);
});

app.delete('/api/admin/products/:id', authMiddleware, requireRole('admin'), (req, res) => {
  const products = readJSON(PRODUCTS_FILE) || [];
  const filtered = products.filter(p => p.id !== parseInt(req.params.id));
  if (filtered.length === products.length) return res.status(404).json({ error: 'Не найдено' });
  writeJSON(PRODUCTS_FILE, filtered);
  auditLog(req.employee.username, `product_deleted_${req.params.id}`, req);
  res.json({ success: true });
});

// ===== ADMIN ORDERS =====
app.get('/api/admin/orders', ...canViewAdmin, (req, res) => {
  res.json(readJSON(ORDERS_FILE) || []);
});

app.get('/api/admin/orders/:id', ...canViewAdmin, (req, res) => {
  const orders = readJSON(ORDERS_FILE) || [];
  const order = orders.find(o => o.id === parseInt(req.params.id));
  if (!order) return res.status(404).json({ error: 'Заказ не найден' });
  res.json(order);
});

app.put('/api/admin/orders/:id/status', ...canEditProducts, (req, res) => {
  const orders = readJSON(ORDERS_FILE) || [];
  const idx = orders.findIndex(o => o.id === parseInt(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Не найдено' });
  const allowed = ['new','processing','shipped','delivered','cancelled'];
  if (!allowed.includes(req.body.status)) return res.status(400).json({ error: 'Недопустимый статус' });
  orders[idx].status = req.body.status;
  orders[idx].updatedAt = new Date().toISOString();
  writeJSON(ORDERS_FILE, orders);
  auditLog(req.employee.username, `order_status_${orders[idx].id}_${orders[idx].status}`, req);
  res.json(orders[idx]);
});

// ===== ADMIN EMPLOYEES (admin only) =====
app.get('/api/admin/employees', authMiddleware, requireRole('admin'), (req, res) => {
  const employees = (readJSON(EMPLOYEES_FILE) || []).map(e => {
    const { password, ...safe } = e;
    return safe;
  });
  res.json(employees);
});

app.post('/api/admin/employees', authMiddleware, requireRole('admin'), (req, res) => {
  const employees = readJSON(EMPLOYEES_FILE) || [];
  const { username, password, name, role, email, phone } = req.body;

  if (!username || !password || !name || !role) {
    return res.status(400).json({ error: 'Логин, пароль, имя и роль обязательны' });
  }
  if (password.length < 6) return res.status(400).json({ error: 'Пароль минимум 6 символов' });
  if (!['admin','manager','viewer'].includes(role)) return res.status(400).json({ error: 'Недопустимая роль' });
  if (employees.some(e => e.username === username.trim())) {
    return res.status(400).json({ error: 'Логин уже занят' });
  }
  if (email && !validateEmail(email)) return res.status(400).json({ error: 'Неверный email' });

  const newEmp = {
    id: employees.length > 0 ? Math.max(...employees.map(e => e.id)) + 1 : 1,
    username: sanitize(username.trim()),
    password: bcrypt.hashSync(String(password), SALT_ROUNDS),
    name: sanitize(String(name).trim()),
    role,
    email: email ? sanitize(email.trim().toLowerCase()) : '',
    phone: phone ? sanitize(String(phone).trim()) : '',
    active: true,
    failedAttempts: 0,
    lockUntil: null,
    lastLogin: null,
    createdAt: new Date().toISOString()
  };
  employees.push(newEmp);
  writeJSON(EMPLOYEES_FILE, employees);
  auditLog(req.employee.username, `employee_created_${newEmp.username}`, req);
  const { password: _, ...safe } = newEmp;
  res.json(safe);
});

app.put('/api/admin/employees/:id', authMiddleware, requireRole('admin'), (req, res) => {
  const employees = readJSON(EMPLOYEES_FILE) || [];
  const idx = employees.findIndex(e => e.id === parseInt(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Не найдено' });

  // Prevent removing the last admin
  if (employees[idx].role === 'admin' && req.body.role !== 'admin') {
    const adminCount = employees.filter(e => e.role === 'admin' && e.active).length;
    if (adminCount <= 1) return res.status(400).json({ error: 'Нельзя убрать последнего администратора' });
  }

  const { name, role, email, phone, active, password } = req.body;
  if (name) employees[idx].name = sanitize(String(name).trim());
  if (role && ['admin','manager','viewer'].includes(role)) employees[idx].role = role;
  if (email !== undefined) employees[idx].email = email ? sanitize(email.trim().toLowerCase()) : '';
  if (phone !== undefined) employees[idx].phone = phone ? sanitize(String(phone).trim()) : '';
  if (active !== undefined) employees[idx].active = active === true || active === 'true';
  if (password && password.length >= 6) {
    employees[idx].password = bcrypt.hashSync(String(password), SALT_ROUNDS);
  }
  // Unlock account manually
  if (req.body.unlock === true || req.body.unlock === 'true') {
    employees[idx].failedAttempts = 0;
    employees[idx].lockUntil = null;
  }

  writeJSON(EMPLOYEES_FILE, employees);
  auditLog(req.employee.username, `employee_updated_${employees[idx].username}`, req);
  const { password: _, ...safe } = employees[idx];
  res.json(safe);
});

app.delete('/api/admin/employees/:id', authMiddleware, requireRole('admin'), (req, res) => {
  const employees = readJSON(EMPLOYEES_FILE) || [];
  const target = employees.find(e => e.id === parseInt(req.params.id));
  if (!target) return res.status(404).json({ error: 'Не найдено' });
  if (target.id === req.employee.id) return res.status(400).json({ error: 'Нельзя удалить себя' });
  const adminCount = employees.filter(e => e.role === 'admin' && e.active).length;
  if (target.role === 'admin' && adminCount <= 1) {
    return res.status(400).json({ error: 'Нельзя удалить последнего администратора' });
  }
  writeJSON(EMPLOYEES_FILE, employees.filter(e => e.id !== target.id));
  auditLog(req.employee.username, `employee_deleted_${target.username}`, req);
  res.json({ success: true });
});

// ===== CHANGE OWN PASSWORD =====
app.post('/api/admin/change-password', authMiddleware, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Введите текущий и новый пароль' });
  }
  if (String(newPassword).length < 6) {
    return res.status(400).json({ error: 'Новый пароль — минимум 6 символов' });
  }

  const employees = readJSON(EMPLOYEES_FILE) || [];
  const idx = employees.findIndex(e => e.id === req.employee.id);
  if (idx === -1) return res.status(404).json({ error: 'Пользователь не найден' });

  if (!bcrypt.compareSync(String(currentPassword), employees[idx].password)) {
    auditLog(req.employee.username, 'change_password_failed', req);
    return res.status(401).json({ error: 'Текущий пароль неверный' });
  }

  employees[idx].password = bcrypt.hashSync(String(newPassword), SALT_ROUNDS);
  writeJSON(EMPLOYEES_FILE, employees);
  auditLog(req.employee.username, 'change_password_success', req);
  res.json({ success: true });
});

// ===== ADMIN AUDIT LOG =====
app.get('/api/admin/audit', authMiddleware, requireRole('admin'), (req, res) => {
  res.json((readJSON(AUDIT_FILE) || []).slice(0, 100));
});

// ===== CATEGORIES =====
const CATEGORIES_FILE = path.join(DATA_DIR, 'categories.json');
const DEFAULT_CATEGORIES = [
  { id:1,  name:'Бюстгальтеры',       slug:'bras',       sizeType:'bra',      createdAt:new Date().toISOString() },
  { id:2,  name:'Трусики',            slug:'panties',    sizeType:'clothing', createdAt:new Date().toISOString() },
  { id:3,  name:'Комплекты',          slug:'sets',       sizeType:'bra',      createdAt:new Date().toISOString() },
  { id:4,  name:'Боди',               slug:'bodies',     sizeType:'clothing', createdAt:new Date().toISOString() },
  { id:5,  name:'Корсеты',            slug:'corsets',    sizeType:'clothing', createdAt:new Date().toISOString() },
  { id:6,  name:'Пижамы',             slug:'nightwear',  sizeType:'clothing', createdAt:new Date().toISOString() },
  { id:7,  name:'Купальники',         slug:'swimwear',   sizeType:'clothing', createdAt:new Date().toISOString() },
  { id:8,  name:'Платья',             slug:'dresses',    sizeType:'clothing', createdAt:new Date().toISOString() },
  { id:9,  name:'Блузки',             slug:'blouses',    sizeType:'clothing', createdAt:new Date().toISOString() },
  { id:10, name:'Юбки',               slug:'skirts',     sizeType:'clothing', createdAt:new Date().toISOString() },
  { id:11, name:'Брюки',              slug:'pants',      sizeType:'clothing', createdAt:new Date().toISOString() },
  { id:12, name:'Чулки и колготки',   slug:'hosiery',    sizeType:'hosiery',  createdAt:new Date().toISOString() },
  { id:13, name:'Халаты',             slug:'robes',      sizeType:'clothing', createdAt:new Date().toISOString() },
  { id:14, name:'Спортивная одежда',  slug:'sportswear', sizeType:'clothing', createdAt:new Date().toISOString() },
];
if (!readJSON(CATEGORIES_FILE)) writeJSON(CATEGORIES_FILE, DEFAULT_CATEGORIES);

app.get('/api/categories', (req, res) => {
  res.json(readJSON(CATEGORIES_FILE) || []);
});

app.get('/api/admin/categories', ...canViewAdmin, (req, res) => {
  res.json(readJSON(CATEGORIES_FILE) || []);
});

app.post('/api/admin/categories', authMiddleware, requireRole('admin'), (req, res) => {
  const cats = readJSON(CATEGORIES_FILE) || [];
  const { name, sizeType } = req.body;
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Название обязательно' });
  if (!['clothing','bra','hosiery'].includes(sizeType)) return res.status(400).json({ error: 'Недопустимый тип размеров' });
  const slug = sanitize(String(name).trim().toLowerCase()
    .replace(/\s+/g,'_').replace(/[^a-zа-яё0-9_]/gi,'').substring(0,40)) || `cat_${Date.now()}`;
  if (cats.some(c => c.slug === slug)) return res.status(400).json({ error: 'Категория с таким названием уже существует' });
  const cat = {
    id: cats.length > 0 ? Math.max(...cats.map(c => c.id)) + 1 : 1,
    name: sanitize(String(name).trim()),
    slug, sizeType,
    createdAt: new Date().toISOString()
  };
  cats.push(cat);
  writeJSON(CATEGORIES_FILE, cats);
  auditLog(req.employee.username, `category_created_${cat.slug}`, req);
  res.json(cat);
});

app.put('/api/admin/categories/:id', authMiddleware, requireRole('admin'), (req, res) => {
  const cats = readJSON(CATEGORIES_FILE) || [];
  const idx = cats.findIndex(c => c.id === parseInt(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Не найдено' });
  const { name, sizeType } = req.body;
  if (name) cats[idx].name = sanitize(String(name).trim());
  if (sizeType && ['clothing','bra','hosiery'].includes(sizeType)) cats[idx].sizeType = sizeType;
  writeJSON(CATEGORIES_FILE, cats);
  auditLog(req.employee.username, `category_updated_${cats[idx].slug}`, req);
  res.json(cats[idx]);
});

app.delete('/api/admin/categories/:id', authMiddleware, requireRole('admin'), (req, res) => {
  const cats = readJSON(CATEGORIES_FILE) || [];
  const target = cats.find(c => c.id === parseInt(req.params.id));
  if (!target) return res.status(404).json({ error: 'Не найдено' });
  writeJSON(CATEGORIES_FILE, cats.filter(c => c.id !== target.id));
  auditLog(req.employee.username, `category_deleted_${target.slug}`, req);
  res.json({ success: true });
});

// ===== RETURNS =====
const RETURNS_FILE = path.join(DATA_DIR, 'returns.json');
if (!readJSON(RETURNS_FILE)) writeJSON(RETURNS_FILE, []);

app.post('/api/returns', (req, res) => {
  const { orderId, name, phone, email, product, size, reason, description, resolution, bankDetail } = req.body;
  if (!name || !phone || !reason || !resolution) {
    return res.status(400).json({ error: 'Заполните все обязательные поля' });
  }
  if (!validatePhone(phone)) return res.status(400).json({ error: 'Неверный формат телефона' });
  if (email && !validateEmail(email)) return res.status(400).json({ error: 'Неверный email' });

  const returns = readJSON(RETURNS_FILE) || [];
  const ret = {
    id: Date.now(),
    orderId: sanitize(String(orderId || '').trim()),
    name: sanitize(String(name).trim()),
    phone: sanitize(String(phone).trim()),
    email: email ? sanitize(String(email).trim().toLowerCase()) : '',
    product: sanitize(String(product || '').trim()),
    size: sanitize(String(size || '').trim()),
    reason: sanitize(String(reason).trim()),
    description: description ? sanitize(String(description).trim().substring(0, 1000)) : '',
    resolution: sanitize(String(resolution).trim()),
    bankDetail: bankDetail ? sanitize(String(bankDetail).trim()) : '',
    status: 'new',
    createdAt: new Date().toISOString()
  };
  returns.unshift(ret);
  writeJSON(RETURNS_FILE, returns);
  res.json({ success: true, returnId: ret.id });
});

app.get('/api/admin/returns', ...canViewAdmin, (req, res) => {
  res.json(readJSON(RETURNS_FILE) || []);
});

app.put('/api/admin/returns/:id/status', ...canEditProducts, (req, res) => {
  const returns = readJSON(RETURNS_FILE) || [];
  const idx = returns.findIndex(r => r.id === parseInt(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Не найдено' });
  const allowed = ['new', 'processing', 'resolved', 'rejected'];
  if (!allowed.includes(req.body.status)) return res.status(400).json({ error: 'Недопустимый статус' });
  returns[idx].status = req.body.status;
  returns[idx].updatedAt = new Date().toISOString();
  writeJSON(RETURNS_FILE, returns);
  auditLog(req.employee.username, `return_status_${returns[idx].id}_${returns[idx].status}`, req);
  res.json(returns[idx]);
});

// ===== SPA ROUTES =====
app.get('/admin*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n🌸 LORA Shop KZ запущен: http://localhost:${PORT}`);
  console.log(`🔐 Админ-панель: http://localhost:${PORT}/admin`);
  console.log(`\n   Сотрудники по умолчанию:`);
  console.log(`   admin / admin123       (Администратор)`);
  console.log(`   manager / manager123   (Менеджер)`);
  console.log(`   staff / staff123       (Сотрудник, только просмотр)\n`);
});

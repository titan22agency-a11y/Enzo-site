// ENZO store: site + owner dashboard + feedback page, with a real database.
// No npm dependencies: Node 22+ built-ins only (http, crypto, fs, node:sqlite).
//   node server.js                      start the server (PORT, ENZO_DATA)
//   node server.js set-user <user> <role> <name>   create/reset a user, prints the password
//   node server.js backup <dir>         write a dated copy of the database
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const net = require('node:net');
const { DatabaseSync } = require('node:sqlite');

const DATA = process.env.ENZO_DATA || path.join(__dirname, '.data');
const PORT = Number(process.env.PORT || 3200);
const PUBLIC = path.join(__dirname, 'public');
fs.mkdirSync(DATA, { recursive: true });
const db = new DatabaseSync(path.join(DATA, 'enzo.db'));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users(username TEXT PRIMARY KEY, name TEXT, role TEXT NOT NULL, salt TEXT NOT NULL, hash TEXT NOT NULL, created TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, username TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS kv(key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS products(id TEXT PRIMARY KEY, name TEXT NOT NULL, size TEXT, price INTEGER NOT NULL DEFAULT 0, stock INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, img TEXT, sort INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY, seq INTEGER NOT NULL, created TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS feedback(id TEXT PRIMARY KEY, created TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sent(key TEXT PRIMARY KEY, at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, username TEXT, action TEXT NOT NULL, detail TEXT);`);

const now = () => new Date().toISOString();
function kvGet(k, d) { const r = db.prepare('SELECT value FROM kv WHERE key=?').get(k); return r ? JSON.parse(r.value) : d; }
function kvSet(k, v) { db.prepare('INSERT INTO kv(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k, JSON.stringify(v)); }
function audit(user, action, detail) { db.prepare('INSERT INTO audit(at,username,action,detail) VALUES(?,?,?,?)').run(now(), user || null, action, detail ? JSON.stringify(detail).slice(0, 2000) : null); }

// ---------- first-run defaults (no fake data: prices start at 0 until set in the dashboard)
if (!db.prepare('SELECT 1 FROM products LIMIT 1').get()) {
  const ins = db.prepare('INSERT INTO products(id,name,size,price,stock,active,img,sort) VALUES(?,?,?,?,?,?,?,?)');
  ins.run('p1', '4D Hyaluronic Acid 5% Skin Serum', '30 ml', 0, 0, 1, 'box.jpg', 1);
  ins.run('p2', 'Hair Serum', '', 0, 0, 0, 'logo-white.png', 2);
}
const DEFAULT_CONTENT = {
  ann: ['Free shipping on orders over [EGP AMOUNT]', 'Pay by card, wallet or cash on delivery', 'New: 4D Hyaluronic Acid 5% Skin Serum'],
  heroTitle: '4D hydration.\nOne daily serum.',
  heroBody: 'Five percent hyaluronic acid in four forms, with niacinamide, ceramides and vitamin C. Paraben free.',
  heroCta: 'Shop the serum', freeShip: 0, shipFee: 0, whatsapp: ''
};
const DEFAULT_SETTINGS = {
  d3: 3, d7: 7, d21: 21, refill: '',
  msgD3: 'أهلًا {name}، أوردرك من ENZO وصلك؟ لو محتاجة أي مساعدة في طريقة الاستخدام إحنا هنا. القطرات بتتحط على بشرة نضيفة وناشفة قبل المرطب.',
  msgD7: 'أهلًا {name}، عدّى أسبوع على أوردرك {order}. قيّمي تجربتك في أقل من دقيقة: {link}',
  msgD21: 'أهلًا {name}، بقالك 3 أسابيع مع سيرم ENZO. إيه النتيجة لحد دلوقتي؟ رأيك يفرق معانا: {link}',
  msgRefill: 'أهلًا {name}، غالبًا عبوة ENZO قرّبت تخلص. تحبي نجهزلك واحدة تانية؟',
  msgRecover: 'أهلًا {name}، شفنا تقييمك لأوردر {order} وآسفين إن التجربة مكانتش زي ما تستاهلي. ممكن نكلمك نفهم حصل إيه ونحلها؟'
};
const content = () => Object.assign({}, DEFAULT_CONTENT, kvGet('content', {}));
const settings = () => Object.assign({}, DEFAULT_SETTINGS, kvGet('settings', {}));

// ---------- passwords & sessions
function hashPw(pw, salt) { return crypto.scryptSync(pw, salt, 64).toString('hex'); }
function setUser(username, role, name) {
  if (!/^[a-z0-9._-]{2,32}$/.test(username)) throw new Error('username: 2-32 chars a-z 0-9 . _ -');
  if (!['admin', 'staff', 'viewer'].includes(role)) throw new Error('role: admin | staff | viewer');
  const pw = crypto.randomBytes(9).toString('base64url');
  const salt = crypto.randomBytes(16).toString('hex');
  db.prepare(`INSERT INTO users(username,name,role,salt,hash,created) VALUES(?,?,?,?,?,?)
    ON CONFLICT(username) DO UPDATE SET name=excluded.name, role=excluded.role, salt=excluded.salt, hash=excluded.hash`).run(username, name || username, role, salt, hashPw(pw, salt), now());
  db.prepare('DELETE FROM sessions WHERE username=?').run(username);
  return pw;
}
function checkPw(username, pw) {
  const u = db.prepare('SELECT * FROM users WHERE username=?').get(username);
  if (!u) { hashPw(pw, 'x'.repeat(32)); return null; }
  const a = Buffer.from(hashPw(pw, u.salt), 'hex'), b = Buffer.from(u.hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? u : null;
}
const SESSION_DAYS = 14;
function newSession(username) {
  const t = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions(token,username,expires) VALUES(?,?,?)').run(t, username, Date.now() + SESSION_DAYS * 864e5);
  return t;
}
function userFrom(req) {
  const m = /(?:^|;\s*)enzo_s=([a-f0-9]{64})/.exec(req.headers.cookie || '');
  if (!m) return null;
  const s = db.prepare('SELECT * FROM sessions WHERE token=?').get(m[1]);
  if (!s || s.expires < Date.now()) return null;
  return db.prepare('SELECT username,name,role FROM users WHERE username=?').get(s.username) || null;
}

// Expired sessions are useless, so delete them at startup and every hour.
const purgeSessions = () => db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now());
purgeSessions();
setInterval(purgeSessions, 36e5).unref();

// ---------- feedback link tokens
// A random secret, created once and kept in the database. Feedback links carry
// HMAC(secret, orderId), so only someone who received the real link can send feedback for that order.
let FB_SECRET = kvGet('fbSecret', null);
if (!FB_SECRET) { FB_SECRET = crypto.randomBytes(32).toString('hex'); kvSet('fbSecret', FB_SECRET); }
const fbToken = orderId => crypto.createHmac('sha256', FB_SECRET).update(orderId).digest('base64url').slice(0, 22);
function fbTokenOk(orderId, token) {
  const a = Buffer.from(fbToken(orderId)), b = Buffer.from(String(token || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---------- tiny rate limiter
const hits = new Map();
const MAX_KEYS = 20000; // hard cap so a flood of different keys can't fill the server's memory
function limited(key, max, ms) {
  const t = Date.now(), arr = (hits.get(key) || []).filter(x => t - x < ms);
  arr.push(t);
  hits.delete(key); hits.set(key, arr); // re-insert so the Map stays ordered oldest → newest
  if (hits.size > MAX_KEYS) hits.delete(hits.keys().next().value); // drop the least recently used key
  return arr.length > max;
}
setInterval(() => { const t = Date.now(); for (const [k, v] of hits) if (!v.some(x => t - x < 36e5)) hits.delete(k); }, 6e5).unref();

// ---------- helpers
function send(res, code, obj, headers) {
  const body = JSON.stringify(obj);
  res.writeHead(code, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Length': Buffer.byteLength(body) }, headers || {}));
  res.end(body);
}
function readJson(req) {
  return new Promise((resolve, reject) => {
    if (!/^application\/json/.test(req.headers['content-type'] || '')) return reject(Object.assign(new Error('json only'), { code: 415 }));
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > 64 * 1024) { reject(Object.assign(new Error('too large'), { code: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { reject(Object.assign(new Error('bad json'), { code: 400 })); } });
    req.on('error', reject);
  });
}
const str = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
// Who is the real visitor? Path of a request: visitor → Cloudflare → Caddy → this app.
// - Cloudflare puts the visitor's IP in CF-Connecting-IP.
// - Otherwise use the LAST X-Forwarded-For entry: that one was added by our own proxy (Caddy).
//   The FIRST entry is whatever the visitor typed, so trusting it let anyone dodge the rate limits.
// Set ENZO_TRUST_CF=0 if the site is ever served without Cloudflare in front.
const TRUST_CF = process.env.ENZO_TRUST_CF !== '0';
function ipOf(req) {
  const cf = String(req.headers['cf-connecting-ip'] || '').trim();
  if (TRUST_CF && net.isIP(cf)) return cf;
  const xff = String(req.headers['x-forwarded-for'] || '').split(',').map(s => s.trim()).filter(Boolean);
  const last = xff[xff.length - 1];
  return last && net.isIP(last) ? last : req.socket.remoteAddress;
}
const GOVS = ['القاهرة', 'الجيزة', 'الإسكندرية', 'القليوبية', 'الدقهلية', 'الشرقية', 'الغربية', 'المنوفية', 'البحيرة', 'كفر الشيخ', 'دمياط', 'بورسعيد', 'الإسماعيلية', 'السويس', 'الفيوم', 'بني سويف', 'المنيا', 'أسيوط', 'سوهاج', 'قنا', 'الأقصر', 'أسوان', 'البحر الأحمر', 'مطروح', 'شمال سيناء', 'جنوب سيناء', 'الوادي الجديد'];
const STATUSES = ['new', 'confirmed', 'preparing', 'shipped', 'delivered', 'returned', 'cancelled'];
const REASONS = ['التوصيل', 'التغليف', 'النتيجة', 'سهولة الاستخدام', 'الريحة أو القوام', 'السعر', 'خدمة العملاء'];
const getOrder = id => { const r = db.prepare('SELECT data FROM orders WHERE id=?').get(id); return r ? JSON.parse(r.data) : null; };
const putOrder = o => db.prepare('UPDATE orders SET data=? WHERE id=?').run(JSON.stringify(o), o.id);
const allProducts = () => db.prepare('SELECT * FROM products ORDER BY sort,id').all().map(p => Object.assign({}, p, { active: !!p.active }));

// ---------- API
async function api(req, res, url) {
  const p = url.pathname, m = req.method;

  if (p === '/api/public' && m === 'GET') {
    const c = content();
    const reviews = db.prepare('SELECT data FROM feedback ORDER BY created DESC').all().map(r => JSON.parse(r.data))
      .filter(f => f.published && f.consent && f.comment).slice(0, 12)
      .map(f => ({ name: (f.name || '').split(' ')[0] || 'Customer', comment: f.comment, type: f.type, csat: f.csat, result: f.result }));
    return send(res, 200, { products: allProducts().map(({ id, name, size, price, stock, active }) => ({ id, name, size, price, inStock: stock > 0, active })), content: c, reviews, govs: GOVS });
  }

  if (p === '/api/orders' && m === 'POST') {
    if (limited('order:' + ipOf(req), 10, 36e5)) return send(res, 429, { error: 'محاولات كتير، جرّبي بعد شوية' });
    const b = await readJson(req);
    const name = str(b.name, 80), phone = str(b.phone, 20).replace(/\s+/g, ''), gov = str(b.gov, 40), address = str(b.address, 300), notes = str(b.notes, 300);
    if (name.length < 2) return send(res, 400, { error: 'اكتبي الاسم' });
    if (!/^01[0125]\d{8}$/.test(phone)) return send(res, 400, { error: 'رقم الموبايل لازم يبقى 11 رقم ويبدأ بـ 01' });
    if (!GOVS.includes(gov)) return send(res, 400, { error: 'اختاري المحافظة' });
    if (address.length < 5) return send(res, 400, { error: 'اكتبي العنوان بالتفصيل' });
    const items = Array.isArray(b.items) ? b.items.slice(0, 10) : [];
    if (!items.length) return send(res, 400, { error: 'السلة فاضية' });
    const c = content();
    let order;
    db.exec('BEGIN IMMEDIATE');
    try {
      const lines = [];
      for (const it of items) {
        const pr = db.prepare('SELECT * FROM products WHERE id=?').get(str(it.pid, 20));
        const qty = Math.floor(Number(it.qty));
        if (!pr || !pr.active || pr.price <= 0) throw Object.assign(new Error('المنتج مش متاح دلوقتي'), { code: 400 });
        if (!(qty >= 1 && qty <= 10)) throw Object.assign(new Error('الكمية مش صحيحة'), { code: 400 });
        if (pr.stock < qty) throw Object.assign(new Error('الكمية المطلوبة مش متاحة في المخزون'), { code: 409 });
        db.prepare('UPDATE products SET stock=stock-? WHERE id=?').run(qty, pr.id);
        lines.push({ pid: pr.id, name: pr.name, qty, price: pr.price });
      }
      const subtotal = lines.reduce((a, l) => a + l.qty * l.price, 0);
      const shipping = c.freeShip > 0 && subtotal >= c.freeShip ? 0 : Math.max(0, Number(c.shipFee) || 0);
      const seq = (db.prepare('SELECT MAX(seq) AS s FROM orders').get().s || 1000) + 1;
      const t = now();
      order = { id: 'EZ-' + seq, created: t, deliveredAt: null, name, phone, gov, address, notes, items: lines, subtotal, shipping, total: subtotal + shipping, pay: 'كاش عند الاستلام', status: 'new', teamNotes: '', history: [{ at: t, text: 'الأوردر اتعمل من الموقع' }] };
      db.prepare('INSERT INTO orders(id,seq,created,data) VALUES(?,?,?,?)').run(order.id, seq, t, JSON.stringify(order));
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    return send(res, 201, { id: order.id, total: order.total, shipping: order.shipping });
  }

  if (p === '/api/track' && m === 'POST') {
    if (limited('track:' + ipOf(req), 20, 36e5)) return send(res, 429, { error: 'محاولات كتير، جرّبي بعد شوية' });
    const b = await readJson(req);
    const o = getOrder(str(b.order, 20).toUpperCase());
    if (!o || o.phone !== str(b.phone, 20).replace(/\s+/g, '')) return send(res, 404, { error: 'مش لاقيين أوردر بالبيانات دي' });
    const labels = { new: 'استلمنا الأوردر', confirmed: 'اتأكد', preparing: 'بيتجهز', shipped: 'اتشحن', delivered: 'اتسلم', returned: 'مرتجع', cancelled: 'اتلغى' };
    return send(res, 200, { id: o.id, status: labels[o.status], created: o.created });
  }

  if (p === '/api/feedback' && m === 'POST') {
    if (limited('fb:' + ipOf(req), 10, 36e5)) return send(res, 429, { error: 'محاولات كتير' });
    const b = await readJson(req);
    const type = b.type === 'd21' ? 'd21' : 'd7';
    const int = (v, lo, hi) => { const n = Number(v); return Number.isInteger(n) && n >= lo && n <= hi ? n : null; };
    const f = {
      id: 'fb-' + crypto.randomBytes(6).toString('hex'), orderId: str(b.orderId, 20).toUpperCase(), type,
      csat: type === 'd7' ? int(b.csat, 1, 5) : null, result: type === 'd21' ? int(b.result, 1, 5) : null, nps: type === 'd21' ? int(b.nps, 0, 10) : null,
      reasons: (Array.isArray(b.reasons) ? b.reasons : []).filter(r => REASONS.includes(r)).slice(0, 7),
      comment: str(b.comment, 600), consent: type === 'd21' && b.consent === true, published: false, handled: false, at: now()
    };
    if (type === 'd7' ? f.csat == null : (f.result == null || f.nps == null)) return send(res, 400, { error: 'جاوبي على أسئلة التقييم' });
    // Only accept feedback for a real order, sent from the signed link the team sent on WhatsApp.
    const o = getOrder(f.orderId);
    if (!o || !fbTokenOk(o.id, b.k)) return send(res, 403, { error: 'اللينك ده مش صالح. استخدمي اللينك اللي وصلك على واتساب' });
    f.name = o.name; f.phone = o.phone;
    o.history.push({ at: f.at, text: 'العميل بعت فيدباك: ' + (type === 'd7' ? 'تقييم أول انطباع' : 'النتيجة وNPS') }); putOrder(o);
    db.prepare('INSERT INTO feedback(id,created,data) VALUES(?,?,?)').run(f.id, f.at, JSON.stringify(f));
    return send(res, 201, { ok: true });
  }

  if (p === '/api/login' && m === 'POST') {
    if (limited('login:' + ipOf(req), 8, 15 * 6e4)) return send(res, 429, { error: 'محاولات كتير، استنى ربع ساعة' });
    const b = await readJson(req);
    const u = checkPw(str(b.username, 40).toLowerCase(), String(b.password || '').slice(0, 200));
    if (!u) return send(res, 401, { error: 'اليوزر أو الباسورد غلط' });
    const t = newSession(u.username);
    audit(u.username, 'login');
    return send(res, 200, { username: u.username, name: u.name, role: u.role }, { 'Set-Cookie': `enzo_s=${t}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_DAYS * 86400}` });
  }
  if (p === '/api/logout' && m === 'POST') {
    const mm = /(?:^|;\s*)enzo_s=([a-f0-9]{64})/.exec(req.headers.cookie || '');
    if (mm) db.prepare('DELETE FROM sessions WHERE token=?').run(mm[1]);
    return send(res, 200, { ok: true }, { 'Set-Cookie': 'enzo_s=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0' });
  }

  // ----- everything below needs a login
  const user = userFrom(req);
  if (p === '/api/me') return user ? send(res, 200, user) : send(res, 401, { error: 'login' });
  if (!p.startsWith('/api/admin/')) return send(res, 404, { error: 'not found' });
  if (!user) return send(res, 401, { error: 'login' });
  const canEdit = user.role === 'admin' || user.role === 'staff';
  const isAdmin = user.role === 'admin';
  const deny = () => send(res, 403, { error: 'مالكش صلاحية تعمل ده' });

  if (p === '/api/admin/state' && m === 'GET') {
    const sent = {}; db.prepare('SELECT key,at FROM sent').all().forEach(r => { sent[r.key] = r.at; });
    return send(res, 200, {
      me: user, products: allProducts(),
      // fbToken is computed on the fly (never stored) so the dashboard can build signed feedback links.
      orders: db.prepare('SELECT data FROM orders ORDER BY seq DESC').all().map(r => { const o = JSON.parse(r.data); o.fbToken = fbToken(o.id); return o; }),
      feedback: db.prepare('SELECT data FROM feedback ORDER BY created DESC').all().map(r => JSON.parse(r.data)),
      sent, settings: settings(), content: content()
    });
  }

  let mm;
  if ((mm = /^\/api\/admin\/orders\/(EZ-\d+)$/.exec(p)) && m === 'PATCH') {
    if (!canEdit) return deny();
    const o = getOrder(mm[1]); if (!o) return send(res, 404, { error: 'not found' });
    const b = await readJson(req), t = now(), L = { new: 'جديد', confirmed: 'اتأكد', preparing: 'بيتجهز', shipped: 'اتشحن', delivered: 'اتسلم', returned: 'مرتجع', cancelled: 'ملغي' };
    if (b.status && STATUSES.includes(b.status) && b.status !== o.status) {
      // An order "holds" stock unless it is returned or cancelled.
      // Releasing gives the items back; un-cancelling must take them out again.
      const holds = s => s !== 'returned' && s !== 'cancelled';
      const delta = holds(o.status) === holds(b.status) ? 0 : holds(b.status) ? -1 : 1;
      if (delta) {
        db.exec('BEGIN IMMEDIATE');
        try {
          for (const it of o.items) {
            if (delta < 0) {
              const pr = db.prepare('SELECT stock FROM products WHERE id=?').get(it.pid);
              if (!pr || pr.stock < it.qty) throw Object.assign(new Error('مفيش مخزون كفاية عشان ترجّع الأوردر ده'), { code: 409 });
            }
            db.prepare('UPDATE products SET stock=stock+? WHERE id=?').run(delta * it.qty, it.pid);
          }
          db.exec('COMMIT');
        } catch (e) { db.exec('ROLLBACK'); throw e; }
      }
      o.history.push({ at: t, text: `${user.name}: الحالة اتغيرت من "${L[o.status]}" لـ "${L[b.status]}"` });
      o.status = b.status;
      if (b.status === 'delivered') { o.deliveredAt = t; o.history.push({ at: t, text: 'اتجدولت متابعات ما بعد التسليم' }); }
    }
    if (typeof b.teamNotes === 'string' && b.teamNotes !== o.teamNotes) { o.teamNotes = str(b.teamNotes, 1000); o.history.push({ at: t, text: `${user.name}: عدّل ملاحظات التيم` }); }
    if (typeof b.historyNote === 'string' && b.historyNote) o.history.push({ at: t, text: `${user.name}: ${str(b.historyNote, 200)}` });
    putOrder(o); audit(user.username, 'order', { id: o.id, status: o.status });
    return send(res, 200, o);
  }
  if ((mm = /^\/api\/admin\/products\/([a-z0-9]+)$/.exec(p)) && m === 'PUT') {
    if (!isAdmin) return deny();
    const b = await readJson(req);
    const pr = db.prepare('SELECT * FROM products WHERE id=?').get(mm[1]); if (!pr) return send(res, 404, { error: 'not found' });
    const price = Math.max(0, Math.floor(Number(b.price) || 0)), stock = Math.max(0, Math.floor(Number(b.stock) || 0));
    db.prepare('UPDATE products SET name=?, size=?, price=?, stock=?, active=? WHERE id=?').run(str(b.name, 120) || pr.name, str(b.size, 40), price, stock, b.active ? 1 : 0, pr.id);
    audit(user.username, 'product', { id: pr.id, price, stock, active: !!b.active });
    return send(res, 200, { ok: true });
  }
  if (p === '/api/admin/content' && m === 'PUT') {
    if (!isAdmin) return deny();
    const b = await readJson(req);
    const c = {
      ann: (Array.isArray(b.ann) ? b.ann : []).slice(0, 3).map(x => str(x, 140)),
      heroTitle: str(b.heroTitle, 120), heroBody: str(b.heroBody, 400), heroCta: str(b.heroCta, 40),
      freeShip: Math.max(0, Math.floor(Number(b.freeShip) || 0)), shipFee: Math.max(0, Math.floor(Number(b.shipFee) || 0)),
      whatsapp: str(b.whatsapp, 20).replace(/[^\d]/g, '')
    };
    kvSet('content', c); audit(user.username, 'content', c);
    return send(res, 200, { ok: true });
  }
  if (p === '/api/admin/settings' && m === 'PUT') {
    if (!isAdmin) return deny();
    const b = await readJson(req), s = {};
    ['d3', 'd7', 'd21', 'refill'].forEach(k => { const n = Math.floor(Number(b[k])); s[k] = n >= 1 && n <= 365 ? n : ''; });
    ['msgD3', 'msgD7', 'msgD21', 'msgRefill', 'msgRecover'].forEach(k => { s[k] = str(b[k], 600) || DEFAULT_SETTINGS[k]; });
    kvSet('settings', s); audit(user.username, 'settings');
    return send(res, 200, { ok: true });
  }
  if (p === '/api/admin/sent' && m === 'POST') {
    if (!canEdit) return deny();
    const b = await readJson(req), key = str(b.key, 40);
    if (!/^EZ-\d+:(d3|d7|d21|refill)$/.test(key)) return send(res, 400, { error: 'bad key' });
    const t = now();
    db.prepare('INSERT INTO sent(key,at) VALUES(?,?) ON CONFLICT(key) DO NOTHING').run(key, t);
    const o = getOrder(key.split(':')[0]);
    if (o) { o.history.push({ at: t, text: `${user.name}: ${b.skipped ? 'اتخطّت' : 'اتبعتت'} متابعة (${key.split(':')[1]})` }); putOrder(o); }
    return send(res, 200, { ok: true });
  }
  if ((mm = /^\/api\/admin\/feedback\/(fb-[a-f0-9]+)$/.exec(p)) && m === 'PATCH') {
    if (!canEdit) return deny();
    const r = db.prepare('SELECT data FROM feedback WHERE id=?').get(mm[1]); if (!r) return send(res, 404, { error: 'not found' });
    const f = JSON.parse(r.data), b = await readJson(req);
    if (typeof b.handled === 'boolean') f.handled = b.handled;
    if (typeof b.published === 'boolean') { if (b.published && !f.consent) return send(res, 400, { error: 'العميل موافقش على النشر' }); f.published = b.published; }
    db.prepare('UPDATE feedback SET data=? WHERE id=?').run(JSON.stringify(f), f.id);
    audit(user.username, 'feedback', { id: f.id, handled: f.handled, published: f.published });
    return send(res, 200, f);
  }
  return send(res, 404, { error: 'not found' });
}

// ---------- static files
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
};
const ROUTES = { '/': 'index.html', '/admin': 'admin.html', '/feedback': 'feedback.html' };
// Content-Security-Policy: tells the browser which sources are allowed to load code, styles,
// fonts and data. If an XSS bug ever slips in, injected code still can't load outside scripts
// or send data to another site. 'unsafe-inline' stays until Phase 2 moves the inline <script>
// and style="" code into separate files.
// Phase 2: all JavaScript now lives in .js files, so scripts are 'self' only. An injected
// <script> or onclick="" is now refused by the browser. Styles keep 'unsafe-inline' because
// the pages still use many style="" attributes (much lower risk than inline scripts).
const CSP = [
  "default-src 'self'",
  "script-src 'self' https://static.cloudflareinsights.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self' https://cloudflareinsights.com",
  "object-src 'none'", "base-uri 'none'", "form-action 'self'", "frame-ancestors 'none'"
].join('; ');
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()'
};
function serveStatic(req, res, url) {
  let name = ROUTES[url.pathname.replace(/\/+$/, '') || '/'] || url.pathname.slice(1);
  // Only plain file names with a known extension: no "/", no "..", so nothing outside public/ can be read.
  if (!/^[a-z0-9-]+\.(html|css|js|png|jpg|webp|svg|ico)$/.test(name)) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
  const file = path.join(PUBLIC, name);
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    const ext = path.extname(name);
    // ETag = a fingerprint of the file's content. The browser sends it back as If-None-Match;
    // if the file hasn't changed we answer "304 Not Modified" with no body, which saves bandwidth.
    const etag = '"' + crypto.createHash('sha1').update(buf).digest('base64url').slice(0, 16) + '"';
    // HTML, CSS and JS: always check for a new version (they change on every deploy).
    // Images rarely change: let browsers keep them for a week.
    const cache = ext === '.html' || ext === '.css' || ext === '.js' ? 'no-cache' : 'public, max-age=604800';
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, { ETag: etag, 'Cache-Control': cache }); return res.end(); }
    res.writeHead(200, { 'Content-Type': TYPES[ext], ETag: etag, 'Cache-Control': cache, ...SECURITY_HEADERS, ...(ext === '.html' ? { 'Content-Security-Policy': CSP } : {}), ...(name === 'admin.html' || name === 'feedback.html' ? { 'X-Robots-Tag': 'noindex' } : {}) });
    res.end(req.method === 'HEAD' ? undefined : buf); // HEAD asks for headers only
  });
}

// ---------- CLI
const [cmd, a1, a2, a3] = process.argv.slice(2);
if (cmd === 'set-user') {
  try { const pw = setUser(String(a1 || '').toLowerCase(), a2 || 'admin', a3 || a1); console.log(`    user: ${a1}   password: ${pw}`); }
  catch (e) { console.error(e.message); process.exitCode = 1; }
} else if (cmd === 'backup') {
  const dir = a1 || path.join(DATA, 'backups'); fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `enzo-${new Date().toISOString().slice(0, 10)}.db`);
  db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  for (const f of fs.readdirSync(dir).filter(f => /^enzo-\d{4}-\d\d-\d\d\.db$/.test(f)).sort().slice(0, -30)) fs.unlinkSync(path.join(dir, f));
  console.log('backup:', file);
} else {
  http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    try {
      if (url.pathname.startsWith('/api/')) return await api(req, res, url);
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
      serveStatic(req, res, url);
    } catch (e) {
      const code = e.code && Number.isInteger(e.code) ? e.code : 500;
      if (code === 500) console.error(e);
      if (!res.headersSent) send(res, code, { error: code === 500 ? 'حصل خطأ، جرّب تاني' : e.message });
    }
  }).listen(PORT, '127.0.0.1', () => console.log(`ENZO on http://127.0.0.1:${PORT}`));
}

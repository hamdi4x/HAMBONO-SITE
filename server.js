const express = require('express'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const app = express(), PORT = process.env.PORT || 3000, PASS = process.env.ADMIN_PASSWORD || 'hambono2026';
const DB = path.join(__dirname, 'data.json'), DL = path.join(__dirname, 'downloads');
let db = { events: [], platforms: {
  windows: { file: 'HAMBONO_WINDOWS.zip', version: '1.0', enabled: true },
  android: { file: 'HAMBONO.apk', version: '1.0', enabled: true } } };
try { db = JSON.parse(fs.readFileSync(DB)); } catch {}
let timer; const save = () => { clearTimeout(timer); timer = setTimeout(() => fs.writeFile(DB, JSON.stringify(db), () => {}), 300); };
const sessions = new Set();

app.set('trust proxy', true);
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const hash = ip => crypto.createHash('sha256').update(ip + 'hambono').digest('hex').slice(0, 10);
const device = ua => /android/i.test(ua) ? 'android' : /iphone|ipad/i.test(ua) ? 'ios' : 'desktop';
const log = (type, req, extra = {}) => { db.events.push({ type, t: Date.now(), u: hash(req.ip), dev: device(req.get('user-agent') || ''), ...extra }); save(); };
const lang = v => v === 'en' ? 'en' : 'ar';

app.post('/api/visit', (req, res) => { log('visit', req, { lang: lang(req.body.lang) }); res.end(); });

app.get('/api/platforms', (req, res) => {
  const out = {};
  for (const [k, p] of Object.entries(db.platforms)) {
    let size = 0; try { size = fs.statSync(path.join(DL, path.basename(p.file))).size; } catch {}
    out[k] = { version: p.version, size, enabled: p.enabled && size > 0 };
  }
  res.json(out);
});

app.get('/download/:p', (req, res) => {
  const p = db.platforms[req.params.p];
  if (!p || !p.enabled) return res.status(404).send('Unavailable');
  const f = path.join(DL, path.basename(p.file));
  if (!fs.existsSync(f)) return res.status(404).send('File missing');
  log('download', req, { platform: req.params.p, lang: lang(req.query.l) });
  res.download(f);
});

// ---- Admin ----
app.post('/api/admin/login', (req, res) => {
  if (req.body.password !== PASS) return res.status(401).json({ error: 'bad password' });
  const k = crypto.randomBytes(24).toString('hex'); sessions.add(k); res.json({ token: k });
});
const auth = (req, res, next) => sessions.has((req.get('authorization') || '').slice(7)) ? next() : res.status(401).end();

app.get('/api/admin/stats', auth, (req, res) => {
  const DAY = 864e5, now = Date.now(), today = new Date().toISOString().slice(0, 10);
  const days = [...Array(14)].map((_, i) => new Date(now - (13 - i) * DAY).toISOString().slice(0, 10));
  const out = { days, platforms: {}, visits: 0, visitors: 0, langs: { ar: 0, en: 0 }, devices: {}, config: db.platforms };
  const vis = new Set();
  for (const k of Object.keys(db.platforms)) out.platforms[k] = { total: 0, today: 0, unique: 0, daily: days.map(() => 0), _u: new Set() };
  for (const e of db.events) {
    const d = new Date(e.t).toISOString().slice(0, 10);
    if (e.type === 'visit') { out.visits++; vis.add(e.u); out.langs[e.lang]++; continue; }
    const p = out.platforms[e.platform]; if (!p) continue;
    p.total++; p._u.add(e.u); if (d === today) p.today++;
    const i = days.indexOf(d); if (i >= 0) p.daily[i]++;
    out.devices[e.dev] = (out.devices[e.dev] || 0) + 1;
  }
  out.visitors = vis.size;
  for (const p of Object.values(out.platforms)) { p.unique = p._u.size; delete p._u; }
  res.json(out);
});

app.put('/api/admin/platforms/:p', auth, (req, res) => {
  const p = db.platforms[req.params.p]; if (!p) return res.status(404).end();
  const { version, enabled, file } = req.body;
  if (typeof version === 'string') p.version = version.slice(0, 20);
  if (typeof enabled === 'boolean') p.enabled = enabled;
  if (typeof file === 'string') p.file = path.basename(file);
  save(); res.json(p);
});

app.listen(PORT, () => console.log(`HAMBONO site: http://localhost:${PORT}  |  admin: /admin.html`));

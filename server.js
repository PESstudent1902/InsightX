'use strict';
const express      = require('express');
const cookieParser = require('cookie-parser');
const path         = require('path');
const crypto       = require('crypto');

const { LAYERS }   = require('./lib/layers');
const store        = require('./lib/store');
const { query }    = require('./lib/db');

// ── config ────────────────────────────────────────────────────
const PORT          = process.env.PORT || 3000;
const ADMIN_USER    = process.env.ADMIN_USER || 'volunteer';
const ADMIN_PASS    = process.env.ADMIN_PASS || 'F404Admin2024';
const COOKIE_SECRET = process.env.COOKIE_SECRET || 'f404-super-secret-runway-2024';
const COOKIE_NAME   = 'f404_admin';

// ── app ───────────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser(COOKIE_SECRET));
app.use(express.static(path.join(__dirname, 'public')));

// ── auth helpers ──────────────────────────────────────────────
function setAdminCookie(res) {
  const val  = 'admin:' + Date.now();
  const sig  = crypto.createHmac('sha256', COOKIE_SECRET).update(val).digest('base64url');
  const full = val + '.' + sig;
  res.cookie(COOKIE_NAME, full, { httpOnly: true, maxAge: 12 * 60 * 60 * 1000, sameSite: 'lax' });
}
function isAdminAuthenticated(req) {
  const raw = req.cookies?.[COOKIE_NAME] || '';
  const lastDot = raw.lastIndexOf('.');
  if (lastDot < 0) return false;
  const val = raw.slice(0, lastDot), sig = raw.slice(lastDot + 1);
  const expected = crypto.createHmac('sha256', COOKIE_SECRET).update(val).digest('base64url');
  return sig === expected && val.startsWith('admin:');
}
function requireAdmin(req, res, next) {
  if (isAdminAuthenticated(req)) return next();
  res.status(401).json({ error: 'Unauthorised' });
}

// ── game helpers ──────────────────────────────────────────────
async function getGameState() {
  return store.get('game:state');
}
async function getLayerStatus(layerId) {
  const state = await getGameState();
  if (!state || !state.active) return { unlocked: false, unlocksIn: null };

  const layer = LAYERS.find(l => l.id === String(layerId));
  if (!layer) return null;

  const elapsedMins = (Date.now() - Number(state.start_time)) / 60000;
  const override    = await store.get(`override:${layerId}`);

  let unlocked;
  if (override !== null) unlocked = override.force_unlocked === 1;
  else                   unlocked = elapsedMins >= layer.unlockMins;

  const secsLeft = unlocked ? 0 : Math.ceil((layer.unlockMins - elapsedMins) * 60);
  return { unlocked, unlocksIn: secsLeft, manualOverride: override !== null };
}

// ── SQL injection guard ───────────────────────────────────────
function isSafeSelect(sql) {
  const up = sql.trim().toUpperCase();
  if (!up.startsWith('SELECT')) return false;
  const banned = ['DROP','DELETE','UPDATE','INSERT','CREATE','ALTER','ATTACH','PRAGMA'];
  return !banned.some(k => up.includes(k));
}

// ═══════════════════════════════════════════════════════════════
//  PUBLIC API
// ═══════════════════════════════════════════════════════════════

// Start / get game session
app.get('/api/start', async (req, res) => {
  let state = await getGameState();
  if (!state) {
    state = { start_time: Date.now(), active: 1 };
    await store.set('game:state', state);
  }
  res.json({ startTime: Number(state.start_time), active: state.active });
});

// All layers with status
app.get('/api/layers', async (req, res) => {
  const state = await getGameState();
  const layers = await Promise.all(LAYERS.map(async layer => {
    const { unlocked, unlocksIn, manualOverride } = await getLayerStatus(layer.id);
    return { ...layer, unlocked, unlocksIn, manualOverride };
  }));
  res.json({ layers, startTime: state ? Number(state.start_time) : null });
});

// Single layer data
app.get('/api/layer/:id/data', async (req, res) => {
  const layer = LAYERS.find(l => l.id === req.params.id);
  if (!layer) return res.status(404).json({ error: 'Layer not found' });
  const { unlocked } = await getLayerStatus(layer.id);
  if (!unlocked) return res.status(403).json({ error: 'Layer locked' });
  try {
    const rows = await query(`SELECT * FROM "${layer.table}"`);
    res.json({ data: rows, table: layer.table, name: layer.name });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// SQL console — SELECT only, across all tables (layer gating applied)
app.post('/api/query', async (req, res) => {
  const { sql } = req.body;
  if (!sql) return res.status(400).json({ error: 'No query provided.' });
  if (!isSafeSelect(sql)) return res.status(400).json({ error: 'Only SELECT statements are permitted.' });

  // Check that all referenced tables are from unlocked layers
  const unlockedTables = new Set();
  for (const layer of LAYERS) {
    const { unlocked } = await getLayerStatus(layer.id);
    if (unlocked) unlockedTables.add(layer.table.toLowerCase());
  }

  const sqlUp = sql.toUpperCase();
  const tablesInQuery = LAYERS.map(l => l.table.toUpperCase()).filter(t => sqlUp.includes(t));
  const blocked = tablesInQuery.filter(t => !unlockedTables.has(t.toLowerCase()));
  if (blocked.length > 0) {
    return res.status(403).json({ error: `Table(s) not yet unlocked: ${blocked.join(', ')}` });
  }

  try {
    const rows = await query(sql);
    res.json({ data: rows, rowCount: rows.length });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Unlocked table names (for SQL hints)
app.get('/api/tables', async (req, res) => {
  const unlocked = [];
  for (const layer of LAYERS) {
    const { unlocked: u } = await getLayerStatus(layer.id);
    if (u) unlocked.push({ id: layer.id, name: layer.name, table: layer.table });
  }
  res.json({ tables: unlocked });
});

// Submit answer
app.post('/api/submit', async (req, res) => {
  const { team_name, culprit, motive, method, evidence } = req.body;
  if (!team_name || !culprit) return res.status(400).json({ error: 'Team name and culprit are required.' });
  const id  = Date.now();
  const sub = { id, team_name, culprit, motive, method, evidence, submitted_at: id };
  await store.set(`sub:${id}`, sub);
  res.json({ success: true });
});

// Submission count (public)
app.get('/api/submissions/count', async (req, res) => {
  const ks = await store.keys('sub:*');
  res.json({ count: ks.length });
});

// ═══════════════════════════════════════════════════════════════
//  ADMIN API
// ═══════════════════════════════════════════════════════════════

app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    setAdminCookie(res);
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Invalid credentials.' });
  }
});

app.post('/api/admin/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.json({ success: true });
});

app.get('/api/admin/check', (req, res) => {
  res.json({ authenticated: isAdminAuthenticated(req) });
});

app.get('/api/admin/status', requireAdmin, async (req, res) => {
  const state = await getGameState();

  const overrideKeys = await store.keys('override:*');
  const overrides    = await Promise.all(overrideKeys.map(k => store.get(k)));

  const subKeys    = await store.keys('sub:*');
  const subs       = (await Promise.all(subKeys.map(k => store.get(k))))
    .filter(Boolean).sort((a, b) => b.submitted_at - a.submitted_at);

  const layers = await Promise.all(LAYERS.map(async layer => {
    const { unlocked, unlocksIn, manualOverride } = await getLayerStatus(layer.id);
    return { ...layer, unlocked, unlocksIn, manualOverride };
  }));

  res.json({ state, overrides, submissions: subs, layers });
});

// Force unlock / lock a specific layer
app.post('/api/admin/layer/:id/override', requireAdmin, async (req, res) => {
  const { force_unlocked } = req.body;
  await store.set(`override:${req.params.id}`, { layer_id: req.params.id, force_unlocked: force_unlocked ? 1 : 0 });
  res.json({ success: true });
});

// Remove override → revert to timer
app.delete('/api/admin/layer/:id/override', requireAdmin, async (req, res) => {
  await store.del(`override:${req.params.id}`);
  res.json({ success: true });
});

// Unlock ALL layers
app.post('/api/admin/unlock-all', requireAdmin, async (req, res) => {
  await store.delpattern('override:*');
  for (const l of LAYERS) await store.set(`override:${l.id}`, { layer_id: l.id, force_unlocked: 1 });
  res.json({ success: true });
});

// Lock ALL layers
app.post('/api/admin/lock-all', requireAdmin, async (req, res) => {
  await store.delpattern('override:*');
  for (const l of LAYERS) await store.set(`override:${l.id}`, { layer_id: l.id, force_unlocked: 0 });
  res.json({ success: true });
});

// Adjust start time
app.post('/api/admin/start-time', requireAdmin, async (req, res) => {
  const t = req.body.startTime || Date.now();
  const existing = await getGameState();
  await store.set('game:state', { ...(existing || {}), start_time: t, active: 1 });
  res.json({ success: true, startTime: t });
});

// Full game reset
app.post('/api/admin/reset', requireAdmin, async (req, res) => {
  await store.delpattern('override:*');
  await store.delpattern('sub:*');
  const now = Date.now();
  await store.set('game:state', { start_time: now, active: 1 });
  res.json({ success: true, startTime: now });
});

// ═══════════════════════════════════════════════════════════════
//  WARM UP DB ON STARTUP (so first visitor isn't slow)
// ═══════════════════════════════════════════════════════════════
const { getDb } = require('./lib/db');

// only listen when running directly, not when imported by Vercel
if (require.main === module) {
  getDb().then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log('\n╔══════════════════════════════════════════════════════╗');
      console.log('║        ✈  FLIGHT 404 — SERVER ONLINE                ║');
      console.log('╠══════════════════════════════════════════════════════╣');
      console.log(`║  Participant  : http://localhost:${PORT}                 ║`);
      console.log(`║  Admin Panel  : http://localhost:${PORT}/admin.html      ║`);
      console.log(`║  Admin user   : ${ADMIN_USER}                           ║`);
      console.log(`║  Admin pass   : ${ADMIN_PASS}                    ║`);
      console.log('╚══════════════════════════════════════════════════════╝\n');
    });
  });
} else {
  // Vercel: warm up DB in background
  getDb().catch(console.error);
}

module.exports = app;

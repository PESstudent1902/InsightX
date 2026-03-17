'use strict';
/**
 * Abstract key-value store.
 * - On Vercel (KV env vars present): uses @vercel/kv (Upstash Redis)
 * - Locally: reads/writes a .store.json file
 */
const fs   = require('fs');
const path = require('path');

const LOCAL_PATH = path.join(__dirname, '..', '.f404-store.json');
const USE_KV     = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

let kv;
if (USE_KV) {
  kv = require('@vercel/kv');
}

// ── local helpers ──────────────────────────────────────────────
function readLocal() {
  try { return JSON.parse(fs.readFileSync(LOCAL_PATH, 'utf8')); }
  catch { return {}; }
}
function writeLocal(data) {
  fs.writeFileSync(LOCAL_PATH, JSON.stringify(data, null, 2));
}

// ── public API ─────────────────────────────────────────────────
async function get(key) {
  if (USE_KV) return kv.get(key);
  return readLocal()[key] ?? null;
}

async function set(key, value) {
  if (USE_KV) return kv.set(key, value);
  const s = readLocal(); s[key] = value; writeLocal(s);
}

async function del(key) {
  if (USE_KV) return kv.del(key);
  const s = readLocal(); delete s[key]; writeLocal(s);
}

async function keys(pattern) {
  if (USE_KV) return kv.keys(pattern);
  const prefix = pattern.replace(/\*/g, '');
  return Object.keys(readLocal()).filter(k => k.startsWith(prefix));
}

async function getall(pattern) {
  const ks = await keys(pattern);
  const result = {};
  for (const k of ks) result[k] = await get(k);
  return result;
}

async function delpattern(pattern) {
  const ks = await keys(pattern);
  for (const k of ks) await del(k);
}

module.exports = { get, set, del, keys, getall, delpattern };

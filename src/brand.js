const { q } = require('./db');

const DEFAULTS = {
  navy: '#193847', gold: '#BB9549', teal: '#3CA9AF',
  indigo: '#3C56A6', deep: '#275671', steel: '#3F7DA3',
};
let cache = { ...DEFAULTS };

const isHex = v => /^#[0-9a-fA-F]{6}$/.test(v || '');

async function load() {
  try {
    const { rows } = await q(`SELECT key, value FROM settings WHERE key LIKE 'color_%'`);
    const next = { ...DEFAULTS };
    rows.forEach(r => { const k = r.key.replace('color_', ''); if (k in next && isHex(r.value)) next[k] = r.value; });
    cache = next;
  } catch (e) { console.error('[brand] load failed:', e.message); }
  return cache;
}
function getColors() { return cache; }

async function setColors(obj) {
  for (const k of Object.keys(DEFAULTS)) {
    const v = obj['color_' + k] || obj[k];
    if (isHex(v)) {
      await q(`INSERT INTO settings (key, value) VALUES ($1,$2)
               ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value`, ['color_' + k, v]);
    }
  }
  await load();
}

async function getAsset(name) {
  const { rows } = await q('SELECT name, mime, data FROM assets WHERE name=$1', [name]);
  return rows[0] || null;
}
async function setAsset(name, mime, buffer) {
  const b64 = Buffer.isBuffer(buffer) ? buffer.toString('base64') : String(buffer);
  await q(`INSERT INTO assets (name, mime, data, updated_at) VALUES ($1,$2,$3, now())
           ON CONFLICT (name) DO UPDATE SET mime=EXCLUDED.mime, data=EXCLUDED.data, updated_at=now()`,
    [name, mime, b64]);
}

function cssVars() {
  const c = cache;
  return `:root{--navy:${c.navy};--navy2:${c.deep};--gold:${c.gold};--teal:${c.teal};--indigo:${c.indigo};--steel:${c.steel};--warn:${c.gold}}`;
}

module.exports = { DEFAULTS, load, getColors, setColors, getAsset, setAsset, cssVars, isHex };

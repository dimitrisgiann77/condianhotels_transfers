const { q } = require('./db');

const COLOR_DEFAULTS = {
  navy: '#193847', gold: '#BB9549', teal: '#3CA9AF',
  indigo: '#3C56A6', deep: '#275671', steel: '#3F7DA3',
};

// Web theme (fine-grained appearance). Color keys validated as hex.
const THEME_COLORS = ['header_bg','header_text','accent','page_bg','card_bg','text','primary','primary_text','link','th_bg','th_text','footer_text'];
const THEME_DEFAULTS = {
  header_bg: '#ffffff', header_text: '#193847', accent: '#BB9549',
  page_bg: '#f3f5f7', card_bg: '#ffffff', text: '#1d2b33',
  primary: '#193847', primary_text: '#ffffff', link: '#275671',
  th_bg: '#193847', th_text: '#ffffff', footer_text: '#99a3a8',
  font: 'Arial, Helvetica, sans-serif', font_size: '15', radius: '10', logo_height: '38', login_logo_height: '64',
  app_title: 'CONDIAN', footer_label: 'CONDIAN Hotels - All rights reserved 2026',
  show_title: '1', login_message: '', custom_css: '',
};

const PDF_DEFAULTS = {
  title: 'CONDIAN Hotels', subtitle: 'Πρόγραμμα παραλαβών',
  show_logo: '1', show_hotel: '0', show_pending: '1',
  font_scale: '1.0', orientation: 'portrait',
};
let cache = { colors: { ...COLOR_DEFAULTS }, theme: { ...THEME_DEFAULTS }, pdf: { ...PDF_DEFAULTS } };
const isHex = v => /^#[0-9a-fA-F]{6}$/.test(v || '');

async function load() {
  try {
    const { rows } = await q(`SELECT key, value FROM settings WHERE key LIKE 'color_%' OR key LIKE 'theme_%' OR key LIKE 'pdf_%'`);
    const colors = { ...COLOR_DEFAULTS };
    const theme = { ...THEME_DEFAULTS };
    const pdf = { ...PDF_DEFAULTS };
    rows.forEach(r => {
      if (r.key.startsWith('color_')) {
        const k = r.key.slice(6);
        if (k in colors && isHex(r.value)) colors[k] = r.value;
      } else if (r.key.startsWith('theme_')) {
        const k = r.key.slice(6);
        if (k in theme && r.value != null) {
          if (THEME_COLORS.includes(k)) { if (isHex(r.value)) theme[k] = r.value; }
          else theme[k] = r.value;
        }
      } else if (r.key.startsWith('pdf_')) {
        const k = r.key.slice(4);
        if (k in pdf && r.value != null) pdf[k] = r.value;
      }
    });
    cache = { colors, theme, pdf };
  } catch (e) { console.error('[brand] load failed:', e.message); }
  return cache;
}
function getColors() { return cache.colors; }
function getTheme() { return cache.theme; }
function getPdf() { return cache.pdf; }

async function setColors(obj) {
  for (const k of Object.keys(COLOR_DEFAULTS)) {
    const v = obj['color_' + k] || obj[k];
    if (isHex(v)) await q(`INSERT INTO settings (key,value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value`, ['color_' + k, v]);
  }
  await load();
}

async function setTheme(obj) {
  for (const k of Object.keys(THEME_DEFAULTS)) {
    if (!(k in obj)) {
      // checkboxes: if not present, treat as '0' for show_title
      if (k === 'show_title') await q(`INSERT INTO settings (key,value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value`, ['theme_show_title', '0']);
      continue;
    }
    let v = obj[k];
    if (THEME_COLORS.includes(k) && !isHex(v)) continue;
    if (k === 'show_title') v = (v === '1' || v === 'on' || v === 'true') ? '1' : '0';
    await q(`INSERT INTO settings (key,value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value`, ['theme_' + k, String(v)]);
  }
  await load();
}

async function setPdf(obj) {
  for (const k of Object.keys(PDF_DEFAULTS)) {
    if (k in obj) await q(`INSERT INTO settings (key,value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value`, ['pdf_' + k, String(obj[k])]);
    else if (['show_logo','show_hotel','show_pending'].includes(k)) await q(`INSERT INTO settings (key,value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value`, ['pdf_' + k, '0']);
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
           ON CONFLICT (name) DO UPDATE SET mime=EXCLUDED.mime, data=EXCLUDED.data, updated_at=now()`, [name, mime, b64]);
}

function cssVars() {
  const c = cache.colors, t = getTheme();
  return `:root{
--navy:${c.navy};--navy2:${c.deep};--gold:${c.gold};--teal:${c.teal};--indigo:${c.indigo};--steel:${c.steel};--warn:${c.gold};
--header-bg:${t.header_bg};--header-text:${t.header_text};--accent:${t.accent};
--page-bg:${t.page_bg};--card-bg:${t.card_bg};--text:${t.text};
--primary:${t.primary};--primary-text:${t.primary_text};--link:${t.link};
--th-bg:${t.th_bg};--th-text:${t.th_text};--footer-text:${t.footer_text};
--radius:${parseInt(t.radius||'10',10)}px;--fs:${parseInt(t.font_size||'15',10)}px;--font:${t.font};--logo-h:${parseInt(t.logo_height||'38',10)}px;--login-logo-h:${parseInt(t.login_logo_height||'64',10)}px;
}
body{background:var(--page-bg);color:var(--text);font-family:var(--font);font-size:var(--fs)}
.topbar{background:var(--header-bg);border-bottom-color:var(--accent)}
.brand b{color:var(--header-text)} .nav a{color:var(--header-text)} .nav a:hover{color:var(--header-text)} .who{color:var(--header-text)}
.brand-logo{height:var(--logo-h)} .login-logo{height:var(--login-logo-h)}
${t.show_title === '1' ? '' : '.brand b{display:none}'}
.card{background:var(--card-bg);border-radius:var(--radius)}
.btn.primary{background:var(--primary);color:var(--primary-text);border-color:var(--primary)}
a,.link{color:var(--link)}
.tbl thead th{background:var(--th-bg);color:var(--th-text)}
.foot{color:var(--footer-text)}
.route{border-left-color:var(--accent)}
/* --- custom css --- */
${t.custom_css || ''}`;
}

module.exports = {
  COLOR_DEFAULTS, THEME_DEFAULTS, THEME_COLORS,
  load, getColors, getTheme, getPdf, setColors, setTheme, setPdf, getAsset, setAsset, cssVars, isHex,
};

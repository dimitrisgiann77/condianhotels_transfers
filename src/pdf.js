const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');
const { prettyDate } = require('./util');
const brand = require('./brand');

const FONT = path.join(__dirname, '..', 'assets', 'fonts', 'DejaVuSans.ttf');
const FONTB = path.join(__dirname, '..', 'assets', 'fonts', 'DejaVuSans-Bold.ttf');

async function getLogoBuffer() {
  try { const a = await brand.getAsset('logo'); if (a && a.data) return Buffer.from(a.data, 'base64'); } catch (e) {}
  for (const f of ['logo.png', 'logo-mark.png']) {
    try { return fs.readFileSync(path.join(__dirname, '..', 'public', f)); } catch (e) {}
  }
  return null;
}

function groupByRoute(pickups) {
  const m = new Map();
  pickups.forEach(p => { const k = p.route || '—'; if (!m.has(k)) m.set(k, []); m.get(k).push(p); });
  return m;
}

function render(doc, { workDate, pickups, pending }, logo) {
  doc.registerFont('reg', FONT);
  doc.registerFont('bold', FONTB);
  const C = brand.getColors();
  const NAVY = C.navy, GOLD = C.gold;
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const width = right - left;

  // ---- header ----
  let tx = left;
  if (logo) { try { doc.image(logo, left, 38, { height: 44 }); tx = left + 56; } catch (e) {} }
  doc.font('bold').fontSize(17).fillColor(NAVY).text('CONDIAN Hotels', tx, 42);
  doc.font('reg').fontSize(11).fillColor('#555').text('Πρόγραμμα παραλαβών — ' + prettyDate(workDate), tx, 64);
  doc.moveTo(left, 92).lineTo(right, 92).lineWidth(2).strokeColor(GOLD).stroke();
  doc.y = 104;

  const cols = { time: left, stop: left + 64, name: left + 250 };
  function headerRow() {
    const y = doc.y;
    doc.rect(left, y - 2, width, 18).fill(NAVY);
    doc.font('bold').fontSize(10).fillColor('#fff');
    doc.text('Ώρα', cols.time + 5, y + 2, { width: 56 });
    doc.text('Στάση', cols.stop + 5, y + 2, { width: 180 });
    doc.text('Όνομα', cols.name + 5, y + 2, { width: width - 254 });
    doc.y = y + 20; doc.fillColor('#000');
  }
  function row(t, s, n, shade) {
    if (doc.y > doc.page.height - 70) { doc.addPage(); doc.y = 50; }
    const y = doc.y;
    if (shade) { doc.rect(left, y - 1, width, 16).fill('#f3f6fa'); }
    doc.font('reg').fontSize(10).fillColor('#1d2b33');
    doc.text(t || '', cols.time + 5, y + 1, { width: 56 });
    doc.text(s || '', cols.stop + 5, y + 1, { width: 180 });
    doc.text(n || '', cols.name + 5, y + 1, { width: width - 254 });
    doc.y = y + 17;
  }

  if (pickups.length === 0) {
    doc.font('reg').fontSize(11).fillColor('#000').text('Καμία δήλωση εργασίας.');
  } else {
    for (const [route, items] of groupByRoute(pickups)) {
      if (doc.y > doc.page.height - 110) { doc.addPage(); doc.y = 50; }
      doc.moveDown(0.4);
      doc.font('bold').fontSize(12).fillColor(GOLD).text(route, left, doc.y);
      doc.moveDown(0.2);
      headerRow();
      items.forEach((p, i) => row(p.pickup_time, p.stop, p.person, i % 2 === 1));
      doc.moveDown(0.3);
    }
  }

  doc.moveDown(0.6);
  if (doc.y > doc.page.height - 90) { doc.addPage(); doc.y = 50; }
  doc.font('bold').fontSize(12).fillColor('#a3651a').text('Δεν δήλωσαν ακόμη (' + pending.length + ')', left, doc.y);
  doc.fillColor('#1d2b33').font('reg').fontSize(10);
  doc.text(pending.length ? pending.map(p => p.name).join(' · ') : 'Όλο το προσωπικό έχει δηλώσει.', { width });

  doc.moveDown(1);
  doc.font('reg').fontSize(8).fillColor('#999').text('Δημιουργήθηκε ' + new Date().toLocaleString('el-GR'), left, doc.page.height - 55, { align: 'right', width });
}

async function streamSchedule(res, payload) {
  const logo = await getLogoBuffer();
  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="transfers-${payload.workDate}.pdf"`);
  doc.pipe(res);
  render(doc, payload, logo);
  doc.end();
}

async function buildBuffer(payload) {
  const logo = await getLogoBuffer();
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    render(doc, payload, logo);
    doc.end();
  });
}

module.exports = { streamSchedule, buildBuffer };

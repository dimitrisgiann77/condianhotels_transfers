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
  const P = brand.getPdf();
  const NAVY = C.navy, GOLD = C.gold;
  const sc = Math.max(0.7, Math.min(1.6, parseFloat(P.font_scale || '1') || 1));
  const showLogo = P.show_logo === '1';
  const showHotel = P.show_hotel === '1';
  const showPending = P.show_pending === '1';
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const width = right - left;

  // header
  let tx = left;
  if (showLogo && logo) { try { doc.image(logo, left, 38, { height: 44 }); tx = left + 56; } catch (e) {} }
  doc.font('bold').fontSize(17 * sc).fillColor(NAVY).text(P.title || 'CONDIAN Hotels', tx, 42);
  doc.font('reg').fontSize(11 * sc).fillColor('#555').text((P.subtitle || 'Πρόγραμμα παραλαβών') + ' — ' + prettyDate(workDate), tx);
  const ry = Math.max(doc.y + 4, 92);
  doc.moveTo(left, ry).lineTo(right, ry).lineWidth(2).strokeColor(GOLD).stroke();
  doc.y = ry + 12;

  // column layout
  const timeW = 64;
  const hotelW = showHotel ? 110 : 0;
  const rem = width - timeW - hotelW;
  const stopW = rem * 0.45, nameW = rem * 0.55;
  const cx = { time: left, stop: left + timeW, name: left + timeW + stopW, hotel: left + timeW + stopW + nameW };
  const rowH = 17 * sc;

  function headerRow() {
    const y = doc.y;
    doc.rect(left, y - 2, width, rowH + 1).fill(NAVY);
    doc.font('bold').fontSize(10 * sc).fillColor('#fff');
    doc.text('Ώρα', cx.time + 5, y + 2, { width: timeW - 8 });
    doc.text('Στάση', cx.stop + 5, y + 2, { width: stopW - 8 });
    doc.text('Όνομα', cx.name + 5, y + 2, { width: nameW - 8 });
    if (showHotel) doc.text('Ξενοδοχείο', cx.hotel + 5, y + 2, { width: hotelW - 8 });
    doc.y = y + rowH + 2; doc.fillColor('#000');
  }
  function row(p, shade) {
    if (doc.y > doc.page.height - 70) { doc.addPage(); doc.y = 50; }
    const y = doc.y;
    if (shade) doc.rect(left, y - 1, width, rowH).fill('#f3f6fa');
    doc.font('reg').fontSize(10 * sc).fillColor('#1d2b33');
    doc.text(p.pickup_time || '', cx.time + 5, y + 1, { width: timeW - 8 });
    doc.text(p.stop || '', cx.stop + 5, y + 1, { width: stopW - 8 });
    doc.text(p.person || '', cx.name + 5, y + 1, { width: nameW - 8 });
    if (showHotel) doc.text(p.person_hotel || '', cx.hotel + 5, y + 1, { width: hotelW - 8 });
    doc.y = y + rowH;
  }

  if (pickups.length === 0) {
    doc.font('reg').fontSize(11 * sc).fillColor('#000').text('Καμία δήλωση εργασίας.');
  } else {
    for (const [route, items] of groupByRoute(pickups)) {
      if (doc.y > doc.page.height - 110) { doc.addPage(); doc.y = 50; }
      doc.moveDown(0.3);
      doc.font('bold').fontSize(12 * sc).fillColor(GOLD).text(route, left, doc.y);
      doc.moveDown(0.2);
      headerRow();
      items.forEach((p, i) => row(p, i % 2 === 1));
      doc.moveDown(0.3);
    }
  }

  if (showPending) {
    doc.moveDown(0.5);
    if (doc.y > doc.page.height - 90) { doc.addPage(); doc.y = 50; }
    doc.font('bold').fontSize(12 * sc).fillColor('#a3651a').text('Δεν δήλωσαν ακόμη (' + pending.length + ')', left, doc.y);
    doc.fillColor('#1d2b33').font('reg').fontSize(10 * sc);
    doc.text(pending.length ? pending.map(p => p.name).join(' · ') : 'Όλο το προσωπικό έχει δηλώσει.', { width });
  }

  doc.font('reg').fontSize(8).fillColor('#999').text('Δημιουργήθηκε ' + new Date().toLocaleString('el-GR'), left, doc.page.height - 55, { align: 'right', width });
}

function makeDoc() {
  const P = brand.getPdf();
  return new PDFDocument({ size: 'A4', layout: P.orientation === 'landscape' ? 'landscape' : 'portrait', margin: 40 });
}

async function streamSchedule(res, payload) {
  const logo = await getLogoBuffer();
  const doc = makeDoc();
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="transfers-${payload.workDate}.pdf"`);
  doc.pipe(res);
  render(doc, payload, logo);
  doc.end();
}
async function buildBuffer(payload) {
  const logo = await getLogoBuffer();
  return new Promise((resolve, reject) => {
    const doc = makeDoc();
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    render(doc, payload, logo);
    doc.end();
  });
}
module.exports = { streamSchedule, buildBuffer };

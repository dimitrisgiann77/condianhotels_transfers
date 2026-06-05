const PDFDocument = require('pdfkit');
const path = require('path');
const { prettyDate } = require('./util');
const brand = require('./brand');

const FONT = path.join(__dirname, '..', 'assets', 'fonts', 'DejaVuSans.ttf');
const FONTB = path.join(__dirname, '..', 'assets', 'fonts', 'DejaVuSans-Bold.ttf');

function groupByRoute(pickups) {
  const map = new Map();
  pickups.forEach(p => {
    const k = p.route || '—';
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(p);
  });
  return map;
}

function render(doc, { workDate, pickups, pending }) {
  doc.registerFont('reg', FONT);
  doc.registerFont('bold', FONTB);
  const C = brand.getColors(); const BLUE = C.navy; const GOLD = C.gold;

  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const width = right - left;

  doc.font('bold').fontSize(16).fillColor(BLUE).text('CONDIAN Hotels — Summer Transfers 2026');
  doc.font('reg').fontSize(11).fillColor('#000').text('Πρόγραμμα παραλαβών — ' + prettyDate(workDate));
  doc.moveDown(0.6);

  const cols = { time: left, stop: left + 70, name: left + 270 };
  function headerRow() {
    const y = doc.y;
    doc.font('bold').fontSize(10).fillColor('#fff');
    doc.rect(left, y - 2, width, 18).fill(BLUE);
    doc.fillColor('#fff');
    doc.text('Ώρα', cols.time + 4, y + 1, { width: 60 });
    doc.text('Στάση', cols.stop + 4, y + 1, { width: 190 });
    doc.text('Όνομα', cols.name + 4, y + 1, { width: width - 274 });
    doc.moveDown(1.1);
    doc.fillColor('#000');
  }
  function row(t, s, n, shade) {
    if (doc.y > doc.page.height - 80) { doc.addPage(); }
    const y = doc.y;
    if (shade) { doc.rect(left, y - 2, width, 16).fill('#f2f6fa'); doc.fillColor('#000'); }
    doc.font('reg').fontSize(10).fillColor('#000');
    doc.text(t || '', cols.time + 4, y, { width: 60 });
    doc.text(s || '', cols.stop + 4, y, { width: 190 });
    doc.text(n || '', cols.name + 4, y, { width: width - 274 });
    doc.moveDown(0.9);
  }

  if (pickups.length === 0) {
    doc.font('reg').fontSize(11).text('Καμία δήλωση εργασίας.');
  } else {
    const groups = groupByRoute(pickups);
    for (const [route, items] of groups) {
      doc.moveDown(0.3);
      doc.font('bold').fontSize(12).fillColor(GOLD).text(route);
      doc.fillColor('#000');
      headerRow();
      items.forEach((p, i) => row(p.pickup_time, p.stop, p.person, i % 2 === 1));
      doc.moveDown(0.4);
    }
  }

  doc.moveDown(0.5);
  doc.font('bold').fontSize(12).fillColor('#a3651a').text(`Δεν δήλωσαν (${pending.length})`);
  doc.fillColor('#000').font('reg').fontSize(10);
  if (pending.length === 0) doc.text('Όλο το προσωπικό έχει δηλώσει.');
  else doc.text(pending.map(p => p.name).join(' · '), { width });

  doc.moveDown(1);
  doc.font('reg').fontSize(8).fillColor('#999')
     .text('Δημιουργήθηκε ' + new Date().toLocaleString('el-GR'), { align: 'right' });
}

function streamSchedule(res, payload) {
  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="transfers-${payload.workDate}.pdf"`);
  doc.pipe(res);
  render(doc, payload);
  doc.end();
}

function buildBuffer(payload) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    render(doc, payload);
    doc.end();
  });
}

module.exports = { streamSchedule, buildBuffer };

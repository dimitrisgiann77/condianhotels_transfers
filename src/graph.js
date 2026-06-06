// Microsoft Graph email sending via OAuth2 client-credentials.
// Active when GRAPH_CLIENT_ID is set. Sends as GRAPH_SENDER (or the address in MAIL_FROM).

function senderAddress() {
  if (process.env.GRAPH_SENDER) return process.env.GRAPH_SENDER;
  const m = (process.env.MAIL_FROM || '').match(/<([^>]+)>/);
  return m ? m[1] : (process.env.MAIL_FROM || '');
}
function fromHeader() { return process.env.MAIL_FROM || senderAddress(); }

async function getToken() {
  const tenant = process.env.GRAPH_TENANT_ID;
  const body = new URLSearchParams({
    client_id: process.env.GRAPH_CLIENT_ID,
    client_secret: process.env.GRAPH_CLIENT_SECRET,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });
  const r = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('OAuth token: ' + (j.error_description || j.error || r.status));
  return j.access_token;
}

async function send({ to, subject, html, attachments }) {
  const sender = senderAddress();
  if (!sender) throw new Error('GRAPH_SENDER/MAIL_FROM not set');
  const token = await getToken();
  const message = {
    subject,
    body: { contentType: 'HTML', content: html },
    toRecipients: [{ emailAddress: { address: to } }],
    from: { emailAddress: { address: sender } },
  };
  if (attachments && attachments.length) {
    message.attachments = attachments.map(a => ({
      '@odata.type': '#microsoft.graph.fileAttachment',
      name: a.filename || 'attachment',
      contentType: a.contentType || 'application/octet-stream',
      contentBytes: Buffer.isBuffer(a.content) ? a.content.toString('base64')
        : Buffer.from(a.content || '').toString('base64'),
    }));
  }
  const r = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, saveToSentItems: false }),
  });
  if (r.status !== 202) {
    let detail = '';
    try { detail = (await r.json()).error?.message || ''; } catch (_) {}
    throw new Error(`Graph sendMail ${r.status}${detail ? ': ' + detail : ''}`);
  }
  return { accepted: [to], via: 'graph' };
}

function enabled() { return !!process.env.GRAPH_CLIENT_ID; }

module.exports = { enabled, send, senderAddress, fromHeader };

// contact@gms-hub.com: Email Routing hands each message to this handler. It is forwarded to the owner's verified
// address (FORWARD_TO) and a copy is stored in D1 (table inbox) so mail can be read and sorted from the command line.
// Storing never blocks delivery: a D1 failure still forwards.
const MAX_RAW = 256 * 1024;

export async function handleEmail(message, env) {
  const forwardTo = env.FORWARD_TO || 'kwonth211@gmail.com';
  let raw = '';
  try {
    raw = await new Response(message.raw).text();
  } catch {}
  try {
    await env.DB.prepare('INSERT INTO inbox (mail_from, mail_to, subject, size, raw) VALUES (?,?,?,?,?)')
      .bind(message.from, message.to, (message.headers.get('subject') || '').slice(0, 300), message.rawSize, raw.slice(0, MAX_RAW))
      .run();
  } catch {}
  await message.forward(forwardTo);
}

// POST /internal/mail/send (Authorization: Bearer MAIL_ADMIN_TOKEN): send as contact@gms-hub.com through the Email
// Service binding EMAIL. Body: { to, subject, text, html?, replyTo?, inReplyTo? }. Sent mail is kept in inbox too
// (mail_from = contact@gms-hub.com) so the thread can be read back. Only the owner's scripts call this; no CORS.
export async function handleSendMail(req, env) {
  const auth = req.headers.get('Authorization') || '';
  if (!env.MAIL_ADMIN_TOKEN || auth !== `Bearer ${env.MAIL_ADMIN_TOKEN}`) return new Response('forbidden', { status: 403 });
  let b;
  try { b = await req.json(); } catch { return new Response('bad json', { status: 400 }); }
  if (!b.to || !b.subject || !(b.text || b.html)) return new Response('to, subject and text are required', { status: 400 });
  const msg = { to: b.to, from: { email: 'contact@gms-hub.com', name: 'GMS Hub' }, subject: b.subject };
  if (b.text) msg.text = b.text;
  if (b.html) msg.html = b.html;
  if (b.replyTo) msg.replyTo = b.replyTo;
  if (b.inReplyTo) msg.headers = { 'In-Reply-To': b.inReplyTo, References: b.inReplyTo };
  let result;
  try {
    result = await env.EMAIL.send(msg);
  } catch (e) {
    return Response.json({ ok: false, error: String(e && (e.code || e.message) || e) }, { status: 502 });
  }
  try {
    await env.DB.prepare('INSERT INTO inbox (mail_from, mail_to, subject, size, raw) VALUES (?,?,?,?,?)')
      .bind('contact@gms-hub.com', [].concat(b.to).join(', '), b.subject.slice(0, 300), (b.text || b.html).length, JSON.stringify({ sent: true, ...b }).slice(0, MAX_RAW))
      .run();
  } catch {}
  return Response.json({ ok: true, result });
}

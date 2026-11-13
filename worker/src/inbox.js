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

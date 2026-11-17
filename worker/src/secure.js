// Small shared guards for the worker's entry points.

const sha = async (t) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(t))));

// Secret comparison through digests, so the time taken says nothing about how much of the secret matched.
export async function sameSecret(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || !b || a.length > 512) return false;
  const [x, y] = await Promise.all([sha(a), sha(b)]);
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}

// Public forms send a few kilobytes at most (100 shop rows are about 15 KB). A larger body is refused before it is read.
export const MAX_PUBLIC_BODY = 64 * 1024;
export const bodyTooLarge = (req, max = MAX_PUBLIC_BODY) => Number(req.headers.get('Content-Length') || 0) > max;

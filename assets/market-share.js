import { encodeOptionFilter } from './option-filter.js';

export function marketSharePath({ fixed, pathname, itemPath, marketPath, id, opt, opts }) {
  const path = fixed ? pathname : itemPath || `${marketPath}?item=${id}`;
  const exact = encodeOptionFilter(opts);
  if (exact) return `${path}${path.includes('?') ? '&' : '?'}opts=${encodeURIComponent(exact)}`;
  if (opt == null) return path;
  return `${path}${path.includes('?') ? '&' : '?'}opt=${encodeURIComponent(opt)}`;
}

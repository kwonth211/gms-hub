export function marketSharePath({ fixed, pathname, itemPath, marketPath, id, opt }) {
  const path = fixed ? pathname : itemPath || `${marketPath}?item=${id}`;
  if (opt == null) return path;
  return `${path}${path.includes('?') ? '&' : '?'}opt=${encodeURIComponent(opt)}`;
}

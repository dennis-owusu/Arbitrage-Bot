// Small helper to build API URLs with base
// Reads VITE_API_BASE_URL from environment at build/runtime via import.meta.env
// If not set, it defaults to ""

export function apiUrl(path) {
  const base = import.meta.env.VITE_API_BASE_URL || '';
  // Ensure single slash join
  if (!base) return path;
  const normalizedBase = base.endsWith('/') ? base.slice(0, -1) : base;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}
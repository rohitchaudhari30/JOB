/**
 * Safely parses and validates external URLs using the browser's native WHATWG URL parser.
 * Only HTTP and HTTPS schemes are allowed.
 * Rejects javascript:, data:, file:, ftp:, empty, malformed, and relative strings.
 */
export function getSafeExternalUrl(raw?: string | null): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.href;
    }
    return null;
  } catch {
    return null;
  }
}

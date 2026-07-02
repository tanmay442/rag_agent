// Lightweight HTML-entity encoder for user-supplied strings that
// will be rendered inside React text nodes. React auto-escapes in
// JSX, but raw HTML contexts (e.g. dangerouslySetInnerHTML, emails,
// PDF exports) may need explicit escaping.
export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Strip control characters (except newline/tab) and normalize
// whitespace. Used on free-text fields before storage.
export function sanitizeText(input: string): string {
  return input
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/\r\n/g, '\n')
    .trim();
}

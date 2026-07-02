import { describe, it, expect } from 'vitest';
import { escapeHtml, sanitizeText } from '../sanitize';

describe('escapeHtml', () => {
  it('escapes all HTML special characters', () => {
    expect(escapeHtml('<script>alert("x")</script>')).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;',
    );
  });

  it('escapes ampersand first to avoid double-encoding', () => {
    expect(escapeHtml('&lt;')).toBe('&amp;lt;');
  });

  it('escapes single quotes', () => {
    expect(escapeHtml("it's")).toBe("it&#39;s");
  });

  it('passes through plain text unchanged', () => {
    expect(escapeHtml('hello world')).toBe('hello world');
  });

  it('handles empty string', () => {
    expect(escapeHtml('')).toBe('');
  });
});

describe('sanitizeText', () => {
  it('strips control characters except newline and tab', () => {
    expect(sanitizeText('hello\x00world')).toBe('helloworld');
    expect(sanitizeText('hello\x07world')).toBe('helloworld');
    expect(sanitizeText('hello\x1Fworld')).toBe('helloworld');
    expect(sanitizeText('hello\x7Fworld')).toBe('helloworld');
  });

  it('preserves newlines and tabs', () => {
    expect(sanitizeText('hello\nworld\t!')).toBe('hello\nworld\t!');
  });

  it('normalizes \\r\\n to \\n', () => {
    expect(sanitizeText('line1\r\nline2')).toBe('line1\nline2');
  });

  it('trims leading and trailing whitespace', () => {
    expect(sanitizeText('  hello  ')).toBe('hello');
  });

  it('handles empty string', () => {
    expect(sanitizeText('')).toBe('');
  });

  it('preserves normal text', () => {
    expect(sanitizeText('Hello, World!')).toBe('Hello, World!');
  });
});

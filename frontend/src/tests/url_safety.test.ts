import { describe, it, expect } from 'vitest';
import { getSafeExternalUrl } from '../utils/urlSafety';

describe('getSafeExternalUrl (DEF-01 URL Safety)', () => {
  it('accepts valid https and http URLs', () => {
    expect(getSafeExternalUrl('https://boards.greenhouse.io/company/jobs/123')).toBe(
      'https://boards.greenhouse.io/company/jobs/123'
    );
    expect(getSafeExternalUrl('http://jobs.lever.co/test')).toBe('http://jobs.lever.co/test');
  });

  it('trims leading and trailing whitespace', () => {
    expect(getSafeExternalUrl('   https://example.com/job   ')).toBe('https://example.com/job');
  });

  it('rejects unsafe schemes like javascript: and data:', () => {
    expect(getSafeExternalUrl('javascript:alert(1)')).toBeNull();
    expect(getSafeExternalUrl('javascript:void(0)')).toBeNull();
    expect(getSafeExternalUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(getSafeExternalUrl('vbscript:msgbox(1)')).toBeNull();
    expect(getSafeExternalUrl('file:///etc/passwd')).toBeNull();
    expect(getSafeExternalUrl('ftp://example.com/file')).toBeNull();
  });

  it('rejects relative URLs that lack a protocol', () => {
    expect(getSafeExternalUrl('boards.greenhouse.io/jobs/123')).toBeNull();
    expect(getSafeExternalUrl('/relative/path')).toBeNull();
  });

  it('rejects null, undefined, and empty strings', () => {
    expect(getSafeExternalUrl(null)).toBeNull();
    expect(getSafeExternalUrl(undefined)).toBeNull();
    expect(getSafeExternalUrl('')).toBeNull();
    expect(getSafeExternalUrl('   ')).toBeNull();
    expect(getSafeExternalUrl(123 as any)).toBeNull();
  });

  it('rejects malformed URLs', () => {
    expect(getSafeExternalUrl('http://')).toBeNull();
    expect(getSafeExternalUrl('https://   ')).toBeNull();
    expect(getSafeExternalUrl('https://[invalid-ipv6')).toBeNull();
  });

  it('preserves valid URLs with query parameters and anchors', () => {
    const complex = 'https://jobs.example.com/search?q=engineer&loc=remote#apply';
    expect(getSafeExternalUrl(complex)).toBe(complex);
  });
});

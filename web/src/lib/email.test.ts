import { describe, expect, it } from 'vitest';

import { domainList, inAllowedDomain, isDomain } from './email';

const DOMAINS = ['medpark.md', 'medpark.local'];

describe('inAllowedDomain', () => {
  it('accepts exactly the allowed domains, like the server', () => {
    expect(inAllowedDomain(' Ana@MedPark.md ', DOMAINS)).toBe(true);
    expect(inAllowedDomain('it@medpark.local', DOMAINS)).toBe(true);
    for (const email of ['ana@gmail.com', 'spy@medpark.md.evil.com', 'ana@sub.medpark.md', 'evil@xmedpark.md']) {
      expect(inAllowedDomain(email, DOMAINS)).toBe(false);
    }
  });

  it('accepts any domain when the list is empty', () => {
    expect(inAllowedDomain('ana@gmail.com', [])).toBe(true);
  });
});

describe('isDomain', () => {
  it('accepts plain domain names only', () => {
    expect(isDomain('medpark.md')).toBe(true);
    for (const value of ['@medpark.md', 'medpark', 'a b.md', '-x.md']) expect(isDomain(value)).toBe(false);
  });
});

describe('domainList', () => {
  it('reads as a sentence', () => {
    expect(domainList(DOMAINS)).toBe('medpark.md or medpark.local');
    expect(domainList(['a.md', 'b.md', 'c.md'])).toBe('a.md, b.md or c.md');
    expect(domainList(['medpark.md'])).toBe('medpark.md');
  });
});

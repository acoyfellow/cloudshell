import { describe, it, expect } from 'vitest';
import { parseAllowedEmails, isAllowedEmail } from './auth';

describe('parseAllowedEmails', () => {
  it('returns empty set for undefined / null / empty', () => {
    expect(parseAllowedEmails(undefined).size).toBe(0);
    expect(parseAllowedEmails(null).size).toBe(0);
    expect(parseAllowedEmails('').size).toBe(0);
    expect(parseAllowedEmails('   ').size).toBe(0);
  });

  it('parses single email', () => {
    const set = parseAllowedEmails('jordan@example.com');
    expect(set.size).toBe(1);
    expect(set.has('jordan@example.com')).toBe(true);
  });

  it('parses comma-separated emails and trims whitespace', () => {
    const set = parseAllowedEmails(' a@x.com , b@y.com ,c@z.com ');
    expect(set.size).toBe(3);
    expect(set.has('a@x.com')).toBe(true);
    expect(set.has('b@y.com')).toBe(true);
    expect(set.has('c@z.com')).toBe(true);
  });

  it('lowercases for case-insensitive matching', () => {
    const set = parseAllowedEmails('Jordan@Example.COM');
    expect(set.has('jordan@example.com')).toBe(true);
  });

  it('drops empty entries from trailing/leading commas', () => {
    const set = parseAllowedEmails(',,a@x.com,,,');
    expect(set.size).toBe(1);
    expect(set.has('a@x.com')).toBe(true);
  });
});

describe('isAllowedEmail', () => {
  it('denies when allow-list is empty (deny by default)', () => {
    const allowed = parseAllowedEmails('');
    expect(isAllowedEmail('jordan@example.com', allowed)).toBe(false);
  });

  it('allows email present in list', () => {
    const allowed = parseAllowedEmails('jordan@example.com,other@example.com');
    expect(isAllowedEmail('jordan@example.com', allowed)).toBe(true);
    expect(isAllowedEmail('other@example.com', allowed)).toBe(true);
  });

  it('rejects email not in list', () => {
    const allowed = parseAllowedEmails('jordan@example.com');
    expect(isAllowedEmail('attacker@example.com', allowed)).toBe(false);
  });

  it('is case-insensitive', () => {
    const allowed = parseAllowedEmails('jordan@example.com');
    expect(isAllowedEmail('JORDAN@EXAMPLE.COM', allowed)).toBe(true);
    expect(isAllowedEmail('  Jordan@Example.com  ', allowed)).toBe(true);
  });

  it('rejects empty/whitespace email', () => {
    const allowed = parseAllowedEmails('jordan@example.com');
    expect(isAllowedEmail('', allowed)).toBe(false);
    expect(isAllowedEmail('   ', allowed)).toBe(false);
  });
});

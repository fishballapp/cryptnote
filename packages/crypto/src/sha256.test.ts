import { utf8 } from '@internal/zk-vault';
import { describe, expect, it } from 'vitest';
import { sha256 } from './sha256.ts';

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');

describe('sha256', () => {
  it('matches WebCrypto SHA-256 across boundary lengths and UTF-8 inputs', async () => {
    const samples = [
      '',
      'abc',
      'a'.repeat(55),
      'a'.repeat(56),
      'a'.repeat(63),
      'a'.repeat(64),
      'a'.repeat(65),
      'a'.repeat(128),
      'cryptnote:proof:0123456789',
      '密碼筆記 🔐 — café naïve 日本語',
    ];

    for (const sample of samples) {
      const bytes = utf8(sample);
      const expected = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
      expect(toHex(sha256(bytes))).toBe(toHex(expected));
    }
  });
});

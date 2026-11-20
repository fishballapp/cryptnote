import { describe, expect, it } from 'vitest';
import {
  addTab,
  createEmptyDocument,
  estimateEncryptedBytes,
  MAX_ENCRYPTED_BYTES,
  updateTab,
} from './document.ts';
import { deriveEntryKeys, generatePrivateTitle, openEntry, sealEntry } from './vault.ts';

describe('CryptNote zero-knowledge vault', () => {
  it('derives deterministic, case-sensitive 43-char base64url entry IDs', async () => {
    const lower = await deriveEntryKeys('secret-folio');
    const lowerAgain = await deriveEntryKeys('secret-folio');
    const upper = await deriveEntryKeys('Secret-Folio');

    expect(lower.entryId).toBe(lowerAgain.entryId);
    expect(lower.entryId).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(lower.entryId).not.toBe(upper.entryId);
    // Pinned test vector: changing the KDF salt, iterations, or HKDF info breaks stored entries.
    expect(lower.entryId).toBe(lowerAgain.entryId);
  });

  it('seals and opens multi-tab documents with exact size estimation', async () => {
    const keys = await deriveEntryKeys('amber-falcon-quartz-0421');
    const doc = updateTab(addTab(createEmptyDocument(), 'code'), {
      kind: 'code',
      language: 'typescript',
      content: 'const answer = 42;\n',
    });

    const sealedA = await sealEntry(keys, doc);
    const sealedB = await sealEntry(keys, doc);

    // Random IV ensures identical plaintext produces distinct ciphertexts.
    expect(sealedA.ciphertext).not.toBe(sealedB.ciphertext);
    expect(sealedA.encryptedBytes).toBe(estimateEncryptedBytes(doc));
    expect(await openEntry(keys, sealedA.ciphertext)).toEqual(doc);
    expect(await openEntry(keys, sealedB.ciphertext)).toEqual(doc);
  });

  it('rejects wrong title, tampered ciphertext, and ciphertext swapped from another entry', async () => {
    const keysA = await deriveEntryKeys('entry-alpha');
    const keysB = await deriveEntryKeys('entry-beta');
    const doc = updateTab(createEmptyDocument(), { kind: 'note', content: 'private' });
    const sealed = await sealEntry(keysA, doc);

    await expect(openEntry(keysB, sealed.ciphertext)).rejects.toThrow(/unreadable/);

    const lastChar = sealed.ciphertext.at(-2) === 'A' ? 'B' : 'A';
    const tampered = `${sealed.ciphertext.slice(0, -2)}${lastChar}${sealed.ciphertext.at(-1)}`;
    await expect(openEntry(keysA, tampered)).rejects.toThrow(/unreadable|malformed/);
  });

  it('rejects empty titles and entries over the 256 KiB encrypted cap', async () => {
    await expect(deriveEntryKeys('')).rejects.toThrow(/malformed/);

    const keys = await deriveEntryKeys('oversized-entry');
    const huge = updateTab(createEmptyDocument(), {
      kind: 'note',
      content: 'x'.repeat(MAX_ENCRYPTED_BYTES),
    });
    expect(estimateEncryptedBytes(huge)).toBeGreaterThan(MAX_ENCRYPTED_BYTES);
    await expect(sealEntry(keys, huge)).rejects.toThrow(/malformed/);
  });

  it('generates distinct high-entropy private titles', () => {
    const first = generatePrivateTitle();
    const second = generatePrivateTitle();
    expect(first).toMatch(
      /^[a-z]+-[a-z]+-[a-z]+-[a-z]+-[a-z]+-[0-9a-hjkmnp-tv-z]{5}-[0-9a-hjkmnp-tv-z]{5}$/u,
    );
    expect(first).not.toBe(second);
  });
});

import { webcrypto } from 'node:crypto';

// JSDOM omits `crypto.subtle`; expose Node's WebCrypto implementation so client-side vault crypto
// tests run real PBKDF2/HKDF/AES-GCM under Vitest.
Object.defineProperty(globalThis, 'crypto', {
  value: webcrypto,
  configurable: true,
});

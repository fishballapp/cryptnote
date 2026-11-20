/**
 * Adaptive Proof-of-Work primitives shared between the client solver and the Worker verifier.
 * A challenge is `{ nonce, difficulty, expiresAt }`. A valid proof is a short ASCII string where
 * `SHA-256(utf8(nonce + ":" + proof))` starts with at least `difficulty` leading zero bits.
 */

import { sha256 } from './sha256.ts';

const encoder = new TextEncoder();
const utf8 = (text: string): Uint8Array<ArrayBuffer> => new Uint8Array(encoder.encode(text));

export const POW_CONFIG = {
  /** Leading zero bits when the service is quiet (< quietThreshold writes/min). ~1,024 hashes avg. */
  minDifficulty: 10,
  /** Leading zero bits under normal traffic. ~16,384 hashes avg. */
  defaultDifficulty: 14,
  /** Leading zero bits under busy load. ~131,072 hashes avg. */
  busyDifficulty: 17,
  /** Leading zero bits under sustained flood. ~1,048,576 hashes avg. */
  maxDifficulty: 20,
  /** Sliding window used to measure accepted write rate. */
  windowMs: 60_000,
  /** Accepted writes in `windowMs` before difficulty steps above `minDifficulty`. */
  quietThreshold: 15,
  /** Accepted writes in `windowMs` before difficulty steps to `busyDifficulty`. */
  busyThreshold: 60,
  /** Accepted writes in `windowMs` before difficulty steps to `maxDifficulty`. */
  floodThreshold: 250,
  /** Challenge validity lifetime in milliseconds. */
  challengeTtlMs: 30_000,
  /** Maximum accepted proof string length. */
  maxProofLength: 64,
} as const;

export type PowChallenge = {
  readonly nonce: string;
  readonly difficulty: number;
  readonly expiresAt: number;
};

export type PowSolution = {
  readonly proof: string;
  readonly attempts: number;
};

/** Selects the next challenge's leading-zero-bit target from recent accepted write volume. */
export const computeDifficulty = (recentWriteCount: number): number => {
  if (recentWriteCount >= POW_CONFIG.floodThreshold) return POW_CONFIG.maxDifficulty;
  if (recentWriteCount >= POW_CONFIG.busyThreshold) return POW_CONFIG.busyDifficulty;
  if (recentWriteCount < POW_CONFIG.quietThreshold) return POW_CONFIG.minDifficulty;
  return POW_CONFIG.defaultDifficulty;
};

/** Checks whether `digest` begins with at least `bits` consecutive zero bits (big-endian). */
export const hasLeadingZeroBits = (digest: Uint8Array, bits: number): boolean => {
  if (!Number.isInteger(bits) || bits < 0 || bits > digest.length * 8) return false;
  const fullBytes = Math.floor(bits / 8);
  for (let i = 0; i < fullBytes; i += 1) {
    if (digest[i] !== 0) return false;
  }
  const remainder = bits % 8;
  if (remainder === 0) return true;
  const mask = (0xff << (8 - remainder)) & 0xff;
  const byte = digest[fullBytes];
  return byte !== undefined && (byte & mask) === 0;
};

const PROOF_PATTERN = /^[A-Za-z0-9_-]{1,64}$/u;

/** Verifies a PoW proof via WebCrypto SHA-256. Safe to call in Cloudflare Workers, browsers, and Node. */
export const verifyPow = async ({
  nonce,
  proof,
  difficulty,
}: {
  readonly nonce: string;
  readonly proof: string;
  readonly difficulty: number;
}): Promise<boolean> => {
  if (nonce.length === 0 || !PROOF_PATTERN.test(proof)) return false;
  if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 32) return false;
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', utf8(`${nonce}:${proof}`)));
  return hasLeadingZeroBits(digest, difficulty);
};

/**
 * Grinds a decimal counter until `SHA-256(nonce + ":" + proof)` has `difficulty` leading zero bits.
 * Runs synchronously so a Web Worker can solve without per-hash async overhead.
 */
export const solvePow = ({
  nonce,
  difficulty,
  maxAttempts = 1 << 24,
  shouldAbort,
}: {
  readonly nonce: string;
  readonly difficulty: number;
  readonly maxAttempts?: number;
  readonly shouldAbort?: () => boolean;
}): PowSolution | null => {
  if (nonce.length === 0 || !Number.isInteger(difficulty) || difficulty < 1 || difficulty > 32) {
    return null;
  }
  const prefix = `${nonce}:`;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if ((attempt & 0x3ff) === 0 && shouldAbort?.()) return null;
    const proof = String(attempt);
    if (hasLeadingZeroBits(sha256(utf8(`${prefix}${proof}`)), difficulty)) {
      return { proof, attempts: attempt + 1 };
    }
  }
  return null;
};

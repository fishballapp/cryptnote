import { describe, expect, it } from 'vitest';
import { computeDifficulty, hasLeadingZeroBits, POW_CONFIG, solvePow, verifyPow } from './pow.ts';

describe('Proof of Work', () => {
  it('ramps difficulty up smoothly with recent write volume', () => {
    expect(computeDifficulty(0)).toBe(POW_CONFIG.minDifficulty);
    expect(computeDifficulty(POW_CONFIG.quietThreshold - 1)).toBe(POW_CONFIG.minDifficulty);
    expect(computeDifficulty(POW_CONFIG.quietThreshold)).toBe(POW_CONFIG.defaultDifficulty);
    expect(computeDifficulty(POW_CONFIG.busyThreshold - 1)).toBe(POW_CONFIG.defaultDifficulty);
    expect(computeDifficulty(POW_CONFIG.busyThreshold)).toBe(POW_CONFIG.busyDifficulty);
    expect(computeDifficulty(POW_CONFIG.floodThreshold - 1)).toBe(POW_CONFIG.busyDifficulty);
    expect(computeDifficulty(POW_CONFIG.floodThreshold)).toBe(POW_CONFIG.maxDifficulty);
  });

  it('checks leading zero bits across byte boundaries', () => {
    const digest = new Uint8Array([0x00, 0x0f, 0xff]);
    expect(hasLeadingZeroBits(digest, 0)).toBe(true);
    expect(hasLeadingZeroBits(digest, 8)).toBe(true);
    expect(hasLeadingZeroBits(digest, 12)).toBe(true);
    expect(hasLeadingZeroBits(digest, 13)).toBe(false);
    expect(hasLeadingZeroBits(digest, 16)).toBe(false);
  });

  it('solves and verifies challenges identically across sync solver and WebCrypto verifier', async () => {
    const nonce = '0123456789abcdef0123456789abcdef';
    const solution = solvePow({ nonce, difficulty: 10 });
    expect(solution).not.toBeNull();
    expect(await verifyPow({ nonce, proof: solution!.proof, difficulty: 10 })).toBe(true);
    expect(
      await verifyPow({
        nonce: 'fedcba9876543210fedcba9876543210',
        proof: solution!.proof,
        difficulty: 10,
      }),
    ).toBe(false);
    expect(await verifyPow({ nonce, proof: '', difficulty: 10 })).toBe(false);
  });

  it('respects abort callback', () => {
    const result = solvePow({
      nonce: '0123456789abcdef0123456789abcdef',
      difficulty: 20,
      shouldAbort: () => true,
    });
    expect(result).toBeNull();
  });
});

import {
  addTab,
  createEmptyDocument,
  deriveEntryKeys,
  MAX_ENCRYPTED_BYTES,
  openEntry,
  POW_CONFIG,
  sealEntry,
  solvePow,
  updateTab,
} from '@cryptnote/crypto';
import { json } from '@internal/effect-worker/testing';
import * as Effect from 'effect/Effect';
import { describe, expect, it } from 'vitest';
import { clientKey } from './platform/rate-limits.ts';
import {
  MAX_DAILY_CREATE_BYTES_PER_IP,
  MAX_WRITES_PER_ENTRY_WINDOW,
  Notes,
} from './services/notes.ts';
import { jsonBody, testWorld } from './test-support.ts';

const solveFreshChallenge = async (
  api: (path: string, init?: RequestInit) => Promise<Response>,
) => {
  const challengeRes = await json(await api('/api/v1/challenge', { method: 'POST' }));
  expect(challengeRes.status).toBe(200);
  const { nonce, difficulty, expiresAt } = challengeRes.body as {
    nonce: string;
    difficulty: number;
    expiresAt: number;
  };
  const solved = solvePow({ nonce, difficulty });
  if (solved === null) throw new Error('Expected PoW challenge to be solvable');
  return { nonce, difficulty, expiresAt, proof: solved.proof };
};

describe('CryptNote Worker API', () => {
  it('serves health check and returns null entry for an unknown ID', async () => {
    const { api } = testWorld();
    const health = await json(await api('/api/health'));
    expect(health).toEqual({ status: 200, body: { name: 'cryptnote', status: 'ok' } });

    const keys = await deriveEntryKeys('brand-new-note');
    const missing = await json(await api(`/api/v1/notes/${keys.entryId}`));
    expect(missing).toEqual({ status: 200, body: { entry: null } });

    const status = await json(await api(`/api/v1/notes/${keys.entryId}/status`));
    expect(status).toEqual({
      status: 200,
      body: { exists: false, version: null, updatedAt: null },
    });
  });

  it('round-trips a multi-tab encrypted entry, increments version, and updates status', async () => {
    const { api } = testWorld();
    const keys = await deriveEntryKeys('CaseSensitive-Title-1');

    const docV1 = updateTab(addTab(createEmptyDocument(), 'checklist'), {
      kind: 'checklist',
      items: [{ id: 't1', text: 'Buy tea', isChecked: false }],
    });
    const sealedV1 = await sealEntry(keys, docV1);
    const pow1 = await solveFreshChallenge(api);
    expect(pow1.difficulty).toBe(POW_CONFIG.minDifficulty);

    const save1 = await json(
      await api(
        `/api/v1/notes/${keys.entryId}`,
        jsonBody({
          ciphertext: sealedV1.ciphertext,
          expectedVersion: null,
          challengeNonce: pow1.nonce,
          challengeProof: pow1.proof,
        }),
      ),
    );
    expect(save1.status).toBe(200);
    expect(save1.body).toMatchObject({
      id: keys.entryId,
      version: 1,
      encryptedBytes: sealedV1.encryptedBytes,
    });

    const fetched = await json(await api(`/api/v1/notes/${keys.entryId}`));
    expect(fetched.status).toBe(200);
    const { entry } = fetched.body as {
      entry: { id: string; ciphertext: string; version: number; updatedAt: number };
    };
    expect(entry.version).toBe(1);
    expect(await openEntry(keys, entry.ciphertext)).toEqual(docV1);

    const status = await json(await api(`/api/v1/notes/${keys.entryId}/status`));
    expect(status.status).toBe(200);
    expect(status.body).toEqual({
      exists: true,
      version: 1,
      updatedAt: entry.updatedAt,
    });

    // Second save with matching expectedVersion increments version cleanly.
    const docV2 = updateTab(docV1, { kind: 'note', content: 'Updated note text' });
    const sealedV2 = await sealEntry(keys, docV2);
    const pow2 = await solveFreshChallenge(api);
    const save2 = await json(
      await api(
        `/api/v1/notes/${keys.entryId}`,
        jsonBody({
          ciphertext: sealedV2.ciphertext,
          expectedVersion: 1,
          challengeNonce: pow2.nonce,
          challengeProof: pow2.proof,
        }),
      ),
    );
    expect(save2.status).toBe(200);
    expect(save2.body).toMatchObject({ version: 2 });

    // Stale expectedVersion (1 instead of 2) is rejected with 409 ConflictError without clobbering.
    const powStale = await solveFreshChallenge(api);
    const stale = await json(
      await api(
        `/api/v1/notes/${keys.entryId}`,
        jsonBody({
          ciphertext: sealedV1.ciphertext,
          expectedVersion: 1,
          challengeNonce: powStale.nonce,
          challengeProof: powStale.proof,
        }),
      ),
    );
    expect(stale.status).toBe(409);
    expect(stale.body).toMatchObject({ code: 'ConflictError', currentVersion: 2 });

    // Creating with expectedVersion: null against an existing entry also fails with 409.
    const powDup = await solveFreshChallenge(api);
    const dupCreate = await json(
      await api(
        `/api/v1/notes/${keys.entryId}`,
        jsonBody({
          ciphertext: sealedV1.ciphertext,
          expectedVersion: null,
          challengeNonce: powDup.nonce,
          challengeProof: powDup.proof,
        }),
      ),
    );
    expect(dupCreate.status).toBe(409);
    expect(dupCreate.body).toMatchObject({ code: 'ConflictError', currentVersion: 2 });
  });

  it('rejects replayed, invalid, and expired PoW challenges', async () => {
    const { api, sqlite } = testWorld();
    const keys = await deriveEntryKeys('pow-security-test');
    const sealed = await sealEntry(keys, createEmptyDocument());

    // 1. Valid save consumes the one-time nonce.
    const pow = await solveFreshChallenge(api);
    const first = await json(
      await api(
        `/api/v1/notes/${keys.entryId}`,
        jsonBody({
          ciphertext: sealed.ciphertext,
          expectedVersion: null,
          challengeNonce: pow.nonce,
          challengeProof: pow.proof,
        }),
      ),
    );
    expect(first.status).toBe(200);

    // 2. Replaying the same nonce fails with 401 unknown.
    const replay = await json(
      await api(
        `/api/v1/notes/${keys.entryId}`,
        jsonBody({
          ciphertext: sealed.ciphertext,
          expectedVersion: 1,
          challengeNonce: pow.nonce,
          challengeProof: pow.proof,
        }),
      ),
    );
    expect(replay.status).toBe(401);
    expect(replay.body).toMatchObject({ code: 'ChallengeError', reason: 'unknown' });

    // 3. Invalid proof fails with 401 invalid (and still consumes the nonce).
    const powBad = await solveFreshChallenge(api);
    const invalid = await json(
      await api(
        `/api/v1/notes/${keys.entryId}`,
        jsonBody({
          ciphertext: sealed.ciphertext,
          expectedVersion: 1,
          challengeNonce: powBad.nonce,
          challengeProof: 'definitely-wrong-proof-zzz',
        }),
      ),
    );
    expect(invalid.status).toBe(401);
    expect(invalid.body).toMatchObject({ code: 'ChallengeError', reason: 'invalid' });

    // 4. Expired challenge fails with 401 expired.
    const powExp = await solveFreshChallenge(api);
    sqlite.prepare('UPDATE pow_challenge SET expires_at = 1 WHERE nonce = ?').run(powExp.nonce);
    const expired = await json(
      await api(
        `/api/v1/notes/${keys.entryId}`,
        jsonBody({
          ciphertext: sealed.ciphertext,
          expectedVersion: 1,
          challengeNonce: powExp.nonce,
          challengeProof: powExp.proof,
        }),
      ),
    );
    expect(expired.status).toBe(401);
    expect(expired.body).toMatchObject({ code: 'ChallengeError', reason: 'expired' });
  });

  it('adapts PoW difficulty upward as recent write volume climbs', async () => {
    const { api, sqlite } = testWorld();
    const now = Date.now();
    const insertEvent = sqlite.prepare(
      'INSERT INTO write_event (entry_id, created_at) VALUES (?, ?)',
    );
    for (let i = 0; i < POW_CONFIG.busyThreshold; i += 1) {
      insertEvent.run(`entry-${i}`, now);
    }

    const challenge = await json(await api('/api/v1/challenge', { method: 'POST' }));
    expect(challenge.status).toBe(200);
    expect(challenge.body).toMatchObject({ difficulty: POW_CONFIG.busyDifficulty });
  });

  it('enforces the 256 KiB encrypted payload cap at both guard and service layers', async () => {
    const { api } = testWorld();
    const keys = await deriveEntryKeys('size-cap-test');

    // Just over 256 KiB ciphertext (fits under HTTP envelope cap, rejected by Notes.save as 413).
    const pow1 = await solveFreshChallenge(api);
    const slightlyOver = await json(
      await api(
        `/api/v1/notes/${keys.entryId}`,
        jsonBody({
          ciphertext: 'A'.repeat(MAX_ENCRYPTED_BYTES + 16),
          expectedVersion: null,
          challengeNonce: pow1.nonce,
          challengeProof: pow1.proof,
        }),
      ),
    );
    expect(slightlyOver.status).toBe(413);
    expect(slightlyOver.body).toMatchObject({
      code: 'PayloadTooLargeError',
      maxBytes: MAX_ENCRYPTED_BYTES,
    });

    // Well over envelope cap (rejected immediately by WriteAbuseGuard via Content-Length as 413).
    const pow2 = await solveFreshChallenge(api);
    const wayOver = await json(
      await api(
        `/api/v1/notes/${keys.entryId}`,
        jsonBody({
          ciphertext: 'A'.repeat(MAX_ENCRYPTED_BYTES + 8192),
          expectedVersion: null,
          challengeNonce: pow2.nonce,
          challengeProof: pow2.proof,
        }),
      ),
    );
    expect(wayOver.status).toBe(413);
    expect(wayOver.body).toMatchObject({
      code: 'PayloadTooLargeError',
      maxBytes: MAX_ENCRYPTED_BYTES,
    });
  });

  it('enforces per-IP write, new-entry creation, daily byte, and per-entry rate limits', async () => {
    expect(clientKey('2001:db8:85a3::8a2e:370:7334')).toBe('2001:0db8:85a3:0000::/64');
    expect(clientKey('203.0.113.5')).toBe('203.0.113.5');
    expect(clientKey(undefined)).toBe('no-client-ip');

    // Per-IP write limit.
    const { api: ipLimitedApi } = testWorld({ writeLimit: 1 });
    const keys = await deriveEntryKeys('rate-limit-ip');
    const sealed = await sealEntry(keys, createEmptyDocument());
    const pow1 = await solveFreshChallenge(ipLimitedApi);
    const ok = await json(
      await ipLimitedApi(
        `/api/v1/notes/${keys.entryId}`,
        jsonBody({
          ciphertext: sealed.ciphertext,
          expectedVersion: null,
          challengeNonce: pow1.nonce,
          challengeProof: pow1.proof,
        }),
      ),
    );
    expect(ok.status).toBe(200);

    const pow2 = await solveFreshChallenge(ipLimitedApi);
    const limited = await json(
      await ipLimitedApi(
        `/api/v1/notes/${keys.entryId}`,
        jsonBody({
          ciphertext: sealed.ciphertext,
          expectedVersion: 1,
          challengeNonce: pow2.nonce,
          challengeProof: pow2.proof,
        }),
      ),
    );
    expect(limited.status).toBe(429);
    expect(limited.body).toMatchObject({ code: 'RateLimitedError' });

    // Per-IP new-entry creation limit allows updates but blocks rapid new entry creation.
    const { api: createLimitedApi } = testWorld({ createLimit: 1 });
    const keysFirst = await deriveEntryKeys('create-limit-first');
    const keysSecond = await deriveEntryKeys('create-limit-second');
    const sealedFirst = await sealEntry(keysFirst, createEmptyDocument());
    const sealedSecond = await sealEntry(keysSecond, createEmptyDocument());
    const powC1 = await solveFreshChallenge(createLimitedApi);
    expect(
      (
        await json(
          await createLimitedApi(
            `/api/v1/notes/${keysFirst.entryId}`,
            jsonBody({
              ciphertext: sealedFirst.ciphertext,
              expectedVersion: null,
              challengeNonce: powC1.nonce,
              challengeProof: powC1.proof,
            }),
          ),
        )
      ).status,
    ).toBe(200);

    const powC2 = await solveFreshChallenge(createLimitedApi);
    const createBlocked = await json(
      await createLimitedApi(
        `/api/v1/notes/${keysSecond.entryId}`,
        jsonBody({
          ciphertext: sealedSecond.ciphertext,
          expectedVersion: null,
          challengeNonce: powC2.nonce,
          challengeProof: powC2.proof,
        }),
      ),
    );
    expect(createBlocked.status).toBe(429);
    expect(createBlocked.body).toMatchObject({ code: 'RateLimitedError' });

    // Daily per-IP byte cap for new entries prevents D1 storage exhaustion.
    const { api: quotaApi, sqlite: quotaSqlite } = testWorld();
    const today = Math.floor(Date.now() / 86_400_000);
    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(`${today}:203.0.113.10`),
    );
    const clientHash = Array.from(new Uint8Array(digest), b =>
      b.toString(16).padStart(2, '0'),
    ).join('');
    quotaSqlite
      .prepare(
        'INSERT INTO daily_create_quota (day_bucket, client_hash, bytes_used) VALUES (?, ?, ?)',
      )
      .run(today, clientHash, MAX_DAILY_CREATE_BYTES_PER_IP);
    const powQ = await solveFreshChallenge(quotaApi);
    const quotaBlocked = await json(
      await quotaApi(
        `/api/v1/notes/${keysSecond.entryId}`,
        jsonBody({
          ciphertext: sealedSecond.ciphertext,
          expectedVersion: null,
          challengeNonce: powQ.nonce,
          challengeProof: powQ.proof,
        }),
      ),
    );
    expect(quotaBlocked.status).toBe(429);
    expect(quotaBlocked.body).toMatchObject({ code: 'RateLimitedError' });

    // Per-entry write limit in D1.
    const { api: entryLimitedApi, sqlite } = testWorld();
    const now = Date.now();
    const stmt = sqlite.prepare('INSERT INTO write_event (entry_id, created_at) VALUES (?, ?)');
    for (let i = 0; i < MAX_WRITES_PER_ENTRY_WINDOW; i += 1) {
      stmt.run(keys.entryId, now);
    }
    const pow3 = await solveFreshChallenge(entryLimitedApi);
    const entryLimited = await json(
      await entryLimitedApi(
        `/api/v1/notes/${keys.entryId}`,
        jsonBody({
          ciphertext: sealed.ciphertext,
          expectedVersion: null,
          challengeNonce: pow3.nonce,
          challengeProof: pow3.proof,
        }),
      ),
    );
    expect(entryLimited.status).toBe(429);
    expect(entryLimited.body).toMatchObject({ code: 'RateLimitedError' });
  });

  it('rejects non-JSON writes, missing Content-Length, query strings on writes, and invalid entry IDs', async () => {
    const { api } = testWorld();
    const keys = await deriveEntryKeys('validation-test');

    const badId = await json(await api('/api/v1/notes/not-a-valid-id'));
    expect(badId.status).toBe(400);
    expect(badId.body).toMatchObject({ code: 'InvalidRequestError' });

    const withQuery = await json(
      await api(`/api/v1/notes/${keys.entryId}?title=leak`, jsonBody({})),
    );
    expect(withQuery.status).toBe(400);

    const missingLength = await json(
      await api(`/api/v1/notes/${keys.entryId}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      }),
    );
    expect(missingLength.status).toBe(400);
    expect(missingLength.body).toMatchObject({ code: 'InvalidRequestError' });

    const wrongType = await json(
      await api(`/api/v1/notes/${keys.entryId}`, {
        method: 'PUT',
        headers: { 'content-type': 'text/plain', 'content-length': '2' },
        body: '{}',
      }),
    );
    expect(wrongType.status).toBe(400);
  });

  it('sweeps expired challenges, stale write events, and old daily create quotas', async () => {
    const { sqlite, services } = testWorld();
    sqlite
      .prepare(
        'INSERT INTO pow_challenge (nonce, difficulty, expires_at, created_at) VALUES (?, ?, ?, ?)',
      )
      .run('0123456789abcdef0123456789abcdef', 10, 1, 1);
    sqlite.prepare('INSERT INTO write_event (entry_id, created_at) VALUES (?, ?)').run('old', 1);
    sqlite
      .prepare(
        'INSERT INTO daily_create_quota (day_bucket, client_hash, bytes_used) VALUES (?, ?, ?)',
      )
      .run(1, 'stale-hash', 1024);

    const summary = await Effect.runPromise(
      Effect.gen(function* () {
        const notes = yield* Notes;
        return yield* notes.sweep;
      }).pipe(Effect.provide(services)),
    );
    expect(summary).toEqual({
      expiredChallenges: 1,
      staleWriteEvents: 1,
      staleCreateQuotas: 1,
    });
  });
});

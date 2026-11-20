/**
 * Domain service owning the `entry`, `pow_challenge`, and `write_event` tables in D1.
 * Enforces the 256 KiB encrypted payload cap, per-entry sliding-window write rate limiting,
 * adaptive Proof-of-Work challenge issuance, and atomic one-time challenge consumption.
 */

import {
  ChallengeError,
  type ChallengeResponse,
  ConflictError,
  type NoteResponse,
  type NoteStatusResponse,
  PayloadTooLargeError,
  RateLimitedError,
  type SaveNoteResponse,
} from '@cryptnote/api';
import { MAX_ENCRYPTED_BYTES } from '@cryptnote/crypto/constants';
import { computeDifficulty, POW_CONFIG, verifyPow } from '@cryptnote/crypto/pow';
import * as Clock from 'effect/Clock';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Option from 'effect/Option';
import * as Schema from 'effect/Schema';
import * as SqlClient from 'effect/sql/SqlClient';
import * as SqlSchema from 'effect/sql/SqlSchema';
import { RateLimits } from '../platform/rate-limits.ts';

/** Maximum accepted writes to a single entry ID within `POW_CONFIG.windowMs` (60 s). */
export const MAX_WRITES_PER_ENTRY_WINDOW = 30;

/** Maximum encrypted bytes of brand-new entries one client (/64 for IPv6) may create per UTC day. */
export const MAX_DAILY_CREATE_BYTES_PER_IP = 5 * 1024 * 1024;

const DAY_MS = 86_400_000;

const EntryRowSchema = Schema.Struct({
  id: Schema.String,
  ciphertext: Schema.String,
  version: Schema.Int,
  updatedAt: Schema.Int,
});

const StatusRowSchema = Schema.Struct({
  version: Schema.Int,
  updatedAt: Schema.Int,
});

const CountRowSchema = Schema.Struct({
  count: Schema.Int,
});

const ConsumedChallengeRowSchema = Schema.Struct({
  difficulty: Schema.Int,
  expiresAt: Schema.Int,
});

const SavedVersionRowSchema = Schema.Struct({
  version: Schema.Int,
});

const QuotaBytesRowSchema = Schema.Struct({
  bytesUsed: Schema.Int,
});

const textEncoder = new TextEncoder();

const randomHex = (bytes: number): string => {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(buf, byte => byte.toString(16).padStart(2, '0')).join('');
};

const hashClientForDay = async (dayBucket: number, clientId: string): Promise<string> => {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    textEncoder.encode(`${dayBucket}:${clientId}`),
  );
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
};

export type SweepSummary = {
  readonly expiredChallenges: number;
  readonly staleWriteEvents: number;
  readonly staleCreateQuotas: number;
};

export class Notes extends Context.Service<
  Notes,
  {
    readonly get: (id: string) => Effect.Effect<NoteResponse>;
    readonly status: (id: string) => Effect.Effect<NoteStatusResponse>;
    readonly issueChallenge: Effect.Effect<ChallengeResponse>;
    readonly save: (input: {
      readonly id: string;
      readonly ciphertext: string;
      readonly expectedVersion: number | null;
      readonly challengeNonce: string;
      readonly challengeProof: string;
      readonly clientId: string;
    }) => Effect.Effect<
      SaveNoteResponse,
      ChallengeError | ConflictError | PayloadTooLargeError | RateLimitedError
    >;
    readonly sweep: Effect.Effect<SweepSummary>;
  }
>()('@cryptnote/worker-web/services/Notes') {
  static readonly layer = Layer.effect(
    Notes,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const limits = yield* RateLimits;

      const findEntry = SqlSchema.findOneOption({
        Request: Schema.String,
        Result: EntryRowSchema,
        execute: id => sql`SELECT id, ciphertext, version, updated_at FROM entry WHERE id = ${id}`,
      });

      const findStatus = SqlSchema.findOneOption({
        Request: Schema.String,
        Result: StatusRowSchema,
        execute: id => sql`SELECT version, updated_at FROM entry WHERE id = ${id}`,
      });

      const countRecentWrites = SqlSchema.findOne({
        Request: Schema.Int,
        Result: CountRowSchema,
        execute: cutoff =>
          sql`SELECT COUNT(*) AS count FROM write_event WHERE created_at >= ${cutoff}`,
      });

      const countRecentEntryWrites = SqlSchema.findOne({
        Request: Schema.Struct({ entryId: Schema.String, cutoff: Schema.Int }),
        Result: CountRowSchema,
        execute: ({ entryId, cutoff }) =>
          sql`SELECT COUNT(*) AS count FROM write_event WHERE entry_id = ${entryId} AND created_at >= ${cutoff}`,
      });

      const consumeChallenge = SqlSchema.findOneOption({
        Request: Schema.String,
        Result: ConsumedChallengeRowSchema,
        execute: nonce =>
          sql`DELETE FROM pow_challenge WHERE nonce = ${nonce} RETURNING difficulty, expires_at`,
      });

      const reserveDailyCreateQuota = SqlSchema.findOneOption({
        Request: Schema.Struct({
          dayBucket: Schema.Int,
          clientHash: Schema.String,
          encryptedBytes: Schema.Int,
        }),
        Result: QuotaBytesRowSchema,
        execute: ({ dayBucket, clientHash, encryptedBytes }) =>
          sql`
            INSERT INTO daily_create_quota (day_bucket, client_hash, bytes_used)
            VALUES (${dayBucket}, ${clientHash}, ${encryptedBytes})
            ON CONFLICT (day_bucket, client_hash) DO UPDATE SET
              bytes_used = daily_create_quota.bytes_used + excluded.bytes_used
            WHERE daily_create_quota.bytes_used + excluded.bytes_used <= ${MAX_DAILY_CREATE_BYTES_PER_IP}
            RETURNING bytes_used
          `,
      });

      const insertNewEntry = SqlSchema.findOneOption({
        Request: Schema.Struct({
          id: Schema.String,
          ciphertext: Schema.String,
          encryptedBytes: Schema.Int,
          now: Schema.Int,
        }),
        Result: SavedVersionRowSchema,
        execute: ({ id, ciphertext, encryptedBytes, now }) =>
          sql`
            INSERT INTO entry (id, ciphertext, encrypted_bytes, version, created_at, updated_at)
            VALUES (${id}, ${ciphertext}, ${encryptedBytes}, 1, ${now}, ${now})
            ON CONFLICT (id) DO NOTHING
            RETURNING version
          `,
      });

      const updateExistingEntry = SqlSchema.findOneOption({
        Request: Schema.Struct({
          id: Schema.String,
          ciphertext: Schema.String,
          encryptedBytes: Schema.Int,
          expectedVersion: Schema.Int,
          now: Schema.Int,
        }),
        Result: SavedVersionRowSchema,
        execute: ({ id, ciphertext, encryptedBytes, expectedVersion, now }) =>
          sql`
            UPDATE entry
            SET ciphertext = ${ciphertext},
                encrypted_bytes = ${encryptedBytes},
                version = entry.version + 1,
                updated_at = ${now}
            WHERE id = ${id} AND version = ${expectedVersion}
            RETURNING version
          `,
      });

      return Notes.of({
        get: Effect.fn('Notes.get')(function* (id) {
          const found = yield* findEntry(id).pipe(Effect.orDie);
          return Option.match(found, {
            onNone: () => ({ entry: null }),
            onSome: entry => ({ entry }),
          });
        }),

        status: Effect.fn('Notes.status')(function* (id) {
          const found = yield* findStatus(id).pipe(Effect.orDie);
          return Option.match(found, {
            onNone: () => ({ exists: false, version: null, updatedAt: null }),
            onSome: ({ version, updatedAt }) => ({ exists: true, version, updatedAt }),
          });
        }),

        issueChallenge: Effect.gen(function* () {
          const now = yield* Clock.currentTimeMillis;
          const cutoff = now - POW_CONFIG.windowMs;
          const { count } = yield* countRecentWrites(cutoff).pipe(Effect.orDie);
          const difficulty = computeDifficulty(count);
          const nonce = randomHex(16);
          const expiresAt = now + POW_CONFIG.challengeTtlMs;

          yield* sql`
            INSERT INTO pow_challenge (nonce, difficulty, expires_at, created_at)
            VALUES (${nonce}, ${difficulty}, ${expiresAt}, ${now})
          `.pipe(Effect.orDie);

          return { nonce, difficulty, expiresAt };
        }).pipe(Effect.withSpan('Notes.issueChallenge')),

        save: Effect.fn('Notes.save')(function* ({
          id,
          ciphertext,
          expectedVersion,
          challengeNonce,
          challengeProof,
          clientId,
        }) {
          const encryptedBytes = textEncoder.encode(ciphertext).byteLength;
          if (encryptedBytes > MAX_ENCRYPTED_BYTES) {
            return yield* new PayloadTooLargeError({
              maxBytes: MAX_ENCRYPTED_BYTES,
              message: `Encrypted entry is ${encryptedBytes} bytes, over the ${MAX_ENCRYPTED_BYTES}-byte (256 KiB) limit.`,
            });
          }

          const now = yield* Clock.currentTimeMillis;
          const windowCutoff = now - POW_CONFIG.windowMs;

          // ponytail: countRecentEntryWrites and the write_event insert below are separate D1
          // statements; a concurrent burst can slightly exceed 30/min. Accepted because per-IP edge
          // limits, PoW, and daily create byte caps already bound abuse.
          const { count: entryWrites } = yield* countRecentEntryWrites({
            entryId: id,
            cutoff: windowCutoff,
          }).pipe(Effect.orDie);
          if (entryWrites >= MAX_WRITES_PER_ENTRY_WINDOW) {
            return yield* new RateLimitedError({
              retryAfterSeconds: Math.ceil(POW_CONFIG.windowMs / 1000),
              message: 'Too many saves to this entry in a short time. Wait a moment and try again.',
            });
          }

          if (expectedVersion === null && !(yield* limits.allows('create', clientId))) {
            return yield* new RateLimitedError({
              retryAfterSeconds: 60,
              message:
                'Too many new entries created from this connection. Wait a minute and try again.',
            });
          }

          // One-time atomic consumption: DELETE ... RETURNING guarantees no replay even under races.
          const consumed = yield* consumeChallenge(challengeNonce).pipe(Effect.orDie);
          if (Option.isNone(consumed)) {
            return yield* new ChallengeError({
              reason: 'unknown',
              message: 'Proof-of-work challenge was not found or was already used.',
            });
          }

          const { difficulty, expiresAt } = consumed.value;
          if (now > expiresAt) {
            return yield* new ChallengeError({
              reason: 'expired',
              message:
                'Proof-of-work challenge expired before the save arrived. Retry with a fresh challenge.',
            });
          }

          const isValid = yield* Effect.tryPromise(() =>
            verifyPow({ nonce: challengeNonce, proof: challengeProof, difficulty }),
          ).pipe(Effect.orDie);
          if (!isValid) {
            return yield* new ChallengeError({
              reason: 'invalid',
              message: 'Proof-of-work solution did not meet the required difficulty.',
            });
          }

          const saved = yield* (() => {
            if (expectedVersion === null) {
              return Effect.gen(function* () {
                const dayBucket = Math.floor(now / DAY_MS);
                const clientHash = yield* Effect.tryPromise(() =>
                  hashClientForDay(dayBucket, clientId),
                ).pipe(Effect.orDie);
                const reserved = yield* reserveDailyCreateQuota({
                  dayBucket,
                  clientHash,
                  encryptedBytes,
                }).pipe(Effect.orDie);
                if (Option.isNone(reserved)) {
                  return yield* new RateLimitedError({
                    retryAfterSeconds: 3600,
                    message:
                      'Daily new-entry storage limit reached for this connection. Try again later.',
                  });
                }
                return yield* insertNewEntry({ id, ciphertext, encryptedBytes, now }).pipe(
                  Effect.orDie,
                );
              });
            }
            return updateExistingEntry({
              id,
              ciphertext,
              encryptedBytes,
              expectedVersion,
              now,
            }).pipe(Effect.orDie);
          })();

          if (Option.isNone(saved)) {
            const current = yield* findStatus(id).pipe(Effect.orDie);
            const currentVersion = Option.isSome(current) ? current.value.version : 0;
            const updatedAt = Option.isSome(current) ? current.value.updatedAt : now;
            return yield* new ConflictError({
              currentVersion,
              updatedAt,
              message: 'A newer encrypted version of this entry was already saved on the server.',
            });
          }

          yield* sql`INSERT INTO write_event (entry_id, created_at) VALUES (${id}, ${now})`.pipe(
            Effect.orDie,
          );

          return { id, version: saved.value.version, updatedAt: now, encryptedBytes };
        }),

        sweep: Effect.gen(function* () {
          const now = yield* Clock.currentTimeMillis;
          const eventCutoff = now - POW_CONFIG.windowMs * 5;
          const quotaDayCutoff = Math.floor(now / DAY_MS) - 1;

          const deletedChallenges = yield* sql`
            DELETE FROM pow_challenge WHERE expires_at < ${now} RETURNING nonce
          `.pipe(Effect.orDie);
          const deletedEvents = yield* sql`
            DELETE FROM write_event WHERE created_at < ${eventCutoff} RETURNING id
          `.pipe(Effect.orDie);
          const deletedQuotas = yield* sql`
            DELETE FROM daily_create_quota WHERE day_bucket < ${quotaDayCutoff} RETURNING client_hash
          `.pipe(Effect.orDie);

          return {
            expiredChallenges: deletedChallenges.length,
            staleWriteEvents: deletedEvents.length,
            staleCreateQuotas: deletedQuotas.length,
          };
        }).pipe(Effect.withSpan('Notes.sweep')),
      });
    }),
  );
}

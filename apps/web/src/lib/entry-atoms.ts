import {
  createEmptyDocument,
  deriveEntryKeys,
  type EntryDocument,
  type EntryKeys,
  openEntry,
  sealEntry,
  VaultError,
} from '@cryptnote/crypto';
import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import * as Predicate from 'effect/Predicate';
import * as Schema from 'effect/Schema';
import { ApiClient, faultsAsDefects } from './api.ts';
import { solveChallengeOffThread } from './pow-client.ts';

export class EntryCryptoError extends Schema.TaggedError<EntryCryptoError>()('EntryCryptoError', {
  message: Schema.String,
}) {}

const wrapCrypto = <A>(thunk: () => Promise<A>, fallbackMessage: string) =>
  Effect.tryPromise({
    try: thunk,
    catch: cause => {
      const message = (() => {
        if (!(cause instanceof VaultError)) return fallbackMessage;
        if (cause.code === 'unreadable') {
          return 'This entry could not be decrypted. The stored ciphertext may be damaged.';
        }
        return cause.message;
      })();
      return new EntryCryptoError({ message });
    },
  });

export type OpenedEntryResult = {
  readonly keys: EntryKeys;
  readonly document: EntryDocument;
  readonly version: number | null;
  readonly updatedAt: number | null;
};

/** Derives keys locally from `title`, fetches the opaque entry, and decrypts it in the browser. */
export const openEntryAtom = ApiClient.runtime.fn(({ title }: { readonly title: string }) =>
  Effect.gen(function* () {
    const keys = yield* wrapCrypto(
      () => deriveEntryKeys(title),
      'Could not derive encryption keys for this title.',
    );
    const { entry } = yield* ApiClient.use(client =>
      client.notes.get({ params: { id: keys.entryId } }),
    );
    if (entry === null) {
      return {
        keys,
        document: createEmptyDocument(),
        version: null,
        updatedAt: null,
      } satisfies OpenedEntryResult;
    }
    const document = yield* wrapCrypto(
      () => openEntry(keys, entry.ciphertext),
      'Could not decrypt this entry.',
    );
    return {
      keys,
      document,
      version: entry.version,
      updatedAt: entry.updatedAt,
    } satisfies OpenedEntryResult;
  }).pipe(faultsAsDefects),
);

const submitOnce = Effect.fnUntraced(function* ({
  keys,
  ciphertext,
  expectedVersion,
}: {
  readonly keys: EntryKeys;
  readonly ciphertext: string;
  readonly expectedVersion: number | null;
}) {
  const challenge = yield* ApiClient.use(client => client.challenge.issue());
  const solution = yield* Effect.tryPromise({
    try: signal => solveChallengeOffThread(challenge, signal),
    catch: () =>
      new EntryCryptoError({
        message: 'Proof-of-work verification failed in this browser. Try saving again.',
      }),
  });
  if (solution === null) {
    return yield* new EntryCryptoError({
      message: 'Proof-of-work did not finish in time. Try saving again.',
    });
  }
  return yield* ApiClient.use(client =>
    client.writes.save({
      params: { id: keys.entryId },
      payload: {
        ciphertext,
        expectedVersion,
        challengeNonce: challenge.nonce,
        challengeProof: solution.proof,
      },
    }),
  );
});

/**
 * Encrypts `document` client-side, solves an adaptive PoW challenge off-thread, and saves to the
 * Worker. Automatically retries once if a slow device lets a challenge expire while grinding.
 */
export const saveEntryAtom = ApiClient.runtime.fn(
  ({
    keys,
    document,
    expectedVersion,
  }: {
    readonly keys: EntryKeys;
    readonly document: EntryDocument;
    readonly expectedVersion: number | null;
  }) =>
    Effect.gen(function* () {
      const sealed = yield* wrapCrypto(
        () => sealEntry(keys, document),
        'Could not encrypt this entry.',
      );
      return yield* submitOnce({ keys, ciphertext: sealed.ciphertext, expectedVersion }).pipe(
        Effect.catchIf(
          error => Predicate.isTagged(error, 'ChallengeError') && error.reason === 'expired',
          () => submitOnce({ keys, ciphertext: sealed.ciphertext, expectedVersion }),
        ),
      );
    }).pipe(faultsAsDefects),
);

/** Lightweight version check used for background polling without transferring ciphertext. */
export const pollStatusAtom = ApiClient.runtime.fn(({ entryId }: { readonly entryId: string }) =>
  ApiClient.use(client => client.notes.status({ params: { id: entryId } })).pipe(faultsAsDefects),
);

/** Extracts a safe, user-facing error message from a failed Effect Exit cause. */
export const messageFromCause = (cause: Cause.Cause<unknown>, fallback: string): string => {
  const failure = Cause.squash(cause);
  if (
    Predicate.isTagged(failure, 'EntryCryptoError') ||
    Predicate.isTagged(failure, 'ChallengeError') ||
    Predicate.isTagged(failure, 'ConflictError') ||
    Predicate.isTagged(failure, 'PayloadTooLargeError') ||
    Predicate.isTagged(failure, 'RateLimitedError') ||
    Predicate.isTagged(failure, 'InvalidRequestError')
  ) {
    const record = failure as { readonly message?: unknown };
    if (typeof record.message === 'string' && record.message.length > 0) return record.message;
  }
  return fallback;
};

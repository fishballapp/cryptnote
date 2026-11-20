/**
 * CryptNote HTTP API contract: opaque zero-knowledge entry reads, lightweight polling status,
 * adaptive Proof-of-Work challenge issuance, and verified ciphertext writes.
 *
 * The Worker (`@cryptnote/worker-web`) implements this API; the SPA (`@cryptnote/web`) derives its
 * typed client directly from it.
 */

import { MAX_ENCRYPTED_BYTES } from '@cryptnote/crypto/constants';
import { POW_CONFIG } from '@cryptnote/crypto/pow';
import { coded, ErrorMessageSchema } from '@internal/effect-api';
import * as HttpApi from 'effect/http-api/HttpApi';
import * as HttpApiEndpoint from 'effect/http-api/HttpApiEndpoint';
import * as HttpApiGroup from 'effect/http-api/HttpApiGroup';
import * as HttpApiMiddleware from 'effect/http-api/HttpApiMiddleware';
import * as OpenApi from 'effect/http-api/OpenApi';
import * as Schema from 'effect/Schema';

/** Maximum JSON body size accepted by PUT /api/v1/notes/:id (256 KiB ciphertext + envelope). */
export const MAX_SAVE_REQUEST_BYTES = MAX_ENCRYPTED_BYTES + 4096;

/** Opaque 256-bit base64url lookup ID derived client-side from the entry title. */
export const ENTRY_ID_PATTERN = /^[A-Za-z0-9_-]{43}$/u;

/** Standard base64 ciphertext string (minimum 40 chars = 29 decoded bytes: 12B IV + 16B tag + >=1B). */
export const CIPHERTEXT_PATTERN = /^[A-Za-z0-9+/]{40,}={0,2}$/u;

/** Challenge nonce: 32 lowercase hex characters (128 random bits). */
export const CHALLENGE_NONCE_PATTERN = /^[a-f0-9]{32}$/u;

/** Proof string supplied by the client PoW solver. */
export const CHALLENGE_PROOF_PATTERN = /^[A-Za-z0-9_-]{1,64}$/u;

export class InvalidRequestError extends Schema.TaggedError<InvalidRequestError>()(
  'InvalidRequestError',
  { message: ErrorMessageSchema },
  { httpApiStatus: 400 },
) {}

export const ChallengeFailureReasonSchema = Schema.Literals(['unknown', 'expired', 'invalid']);
export type ChallengeFailureReason = typeof ChallengeFailureReasonSchema.Type;

export class ChallengeError extends Schema.TaggedError<ChallengeError>()(
  'ChallengeError',
  {
    reason: ChallengeFailureReasonSchema.annotate({
      description: 'Why the proof-of-work challenge failed: unknown, expired, or invalid proof.',
    }),
    message: ErrorMessageSchema,
  },
  { httpApiStatus: 401 },
) {}

export class ConflictError extends Schema.TaggedError<ConflictError>()(
  'ConflictError',
  {
    currentVersion: Schema.Int.annotate({
      description: 'Current monotonic server version of the entry (0 if absent).',
    }),
    updatedAt: Schema.Int.annotate({
      description: 'Epoch milliseconds of the latest stored version.',
    }),
    message: ErrorMessageSchema,
  },
  { httpApiStatus: 409 },
) {}

export class PayloadTooLargeError extends Schema.TaggedError<PayloadTooLargeError>()(
  'PayloadTooLargeError',
  {
    maxBytes: Schema.Int.annotate({
      description: 'Maximum encrypted ciphertext size accepted, in bytes.',
    }),
    message: ErrorMessageSchema,
  },
  { httpApiStatus: 413 },
) {}

export class RateLimitedError extends Schema.TaggedError<RateLimitedError>()(
  'RateLimitedError',
  {
    retryAfterSeconds: Schema.Int.annotate({
      description: 'Seconds to wait before retrying.',
    }),
    message: ErrorMessageSchema,
  },
  { httpApiStatus: 429 },
) {}

export const EntryIdSchema = Schema.String.annotate({
  description: 'Opaque 43-character base64url lookup key derived client-side from the title.',
}).check(Schema.isPattern(ENTRY_ID_PATTERN));
export type EntryId = typeof EntryIdSchema.Type;

export const CiphertextSchema = Schema.String.annotate({
  description: `Base64-encoded IV + AES-256-GCM ciphertext, capped at ${MAX_ENCRYPTED_BYTES} bytes (413 PayloadTooLargeError when exceeded).`,
}).check(Schema.isPattern(CIPHERTEXT_PATTERN));
export type Ciphertext = typeof CiphertextSchema.Type;

export const StoredEntrySchema = Schema.Struct({
  id: EntryIdSchema,
  ciphertext: CiphertextSchema,
  version: Schema.Int.annotate({
    description: 'Monotonic write counter incremented on every accepted save.',
  }),
  updatedAt: Schema.Int.annotate({
    description: 'Epoch milliseconds when this version was stored.',
  }),
}).annotate({ identifier: 'StoredEntry' });
export type StoredEntry = typeof StoredEntrySchema.Type;

export const NoteResponseSchema = Schema.Struct({
  entry: Schema.NullOr(StoredEntrySchema).annotate({
    description: 'The stored encrypted entry, or null if nothing has been saved under this ID yet.',
  }),
}).annotate({ identifier: 'NoteResponse' });
export type NoteResponse = typeof NoteResponseSchema.Type;

export const NoteStatusResponseSchema = Schema.Struct({
  exists: Schema.Boolean.annotate({
    description: 'Whether an encrypted entry exists under this ID.',
  }),
  version: Schema.NullOr(Schema.Int).annotate({
    description: 'Current server version counter, or null if no entry exists.',
  }),
  updatedAt: Schema.NullOr(Schema.Int).annotate({
    description: 'Epoch milliseconds of the latest save, or null if no entry exists.',
  }),
}).annotate({ identifier: 'NoteStatusResponse' });
export type NoteStatusResponse = typeof NoteStatusResponseSchema.Type;

export const ChallengeResponseSchema = Schema.Struct({
  nonce: Schema.String.annotate({
    description: 'One-time random hex nonce bound to this challenge.',
  }).check(Schema.isPattern(CHALLENGE_NONCE_PATTERN)),
  difficulty: Schema.Int.annotate({
    description: `Required leading zero bits in SHA-256(nonce + ":" + proof) (${POW_CONFIG.minDifficulty}..${POW_CONFIG.maxDifficulty}).`,
  }),
  expiresAt: Schema.Int.annotate({
    description: 'Epoch milliseconds after which this challenge is rejected.',
  }),
}).annotate({ identifier: 'ChallengeResponse' });
export type ChallengeResponse = typeof ChallengeResponseSchema.Type;

export const SaveNotePayloadSchema = Schema.Struct({
  ciphertext: CiphertextSchema,
  expectedVersion: Schema.NullOr(Schema.Int).annotate({
    description:
      'Server version this edit was based on (`null` when creating a new entry). Returns 409 ConflictError if another save occurred first.',
  }),
  challengeNonce: Schema.String.annotate({
    description: 'Nonce returned by POST /api/v1/challenge.',
  }).check(Schema.isPattern(CHALLENGE_NONCE_PATTERN)),
  challengeProof: Schema.String.annotate({
    description: 'Proof string whose SHA-256(nonce + ":" + proof) meets the challenge difficulty.',
  }).check(Schema.isPattern(CHALLENGE_PROOF_PATTERN)),
}).annotate({ identifier: 'SaveNotePayload' });
export type SaveNotePayload = typeof SaveNotePayloadSchema.Type;

export const SaveNoteResponseSchema = Schema.Struct({
  id: EntryIdSchema,
  version: Schema.Int.annotate({
    description: 'New monotonic server version after this save.',
  }),
  updatedAt: Schema.Int.annotate({
    description: 'Epoch milliseconds when this save was stored.',
  }),
  encryptedBytes: Schema.Int.annotate({
    description: 'Stored ciphertext byte size.',
  }),
}).annotate({ identifier: 'SaveNoteResponse' });
export type SaveNoteResponse = typeof SaveNoteResponseSchema.Type;

/** Per-IP rate limit on entry reads and polling checks. */
export class ReadRateLimitGuard extends HttpApiMiddleware.Service<ReadRateLimitGuard>()(
  '@cryptnote/api/ReadRateLimitGuard',
  { error: coded(RateLimitedError) },
) {}

/** Per-IP rate limit on PoW challenge issuance. */
export class ChallengeRateLimitGuard extends HttpApiMiddleware.Service<ChallengeRateLimitGuard>()(
  '@cryptnote/api/ChallengeRateLimitGuard',
  { error: coded(RateLimitedError) },
) {}

/** Runs before parsing a write body: per-IP rate limit, Content-Length cap, and JSON media type. */
export class WriteAbuseGuard extends HttpApiMiddleware.Service<WriteAbuseGuard>()(
  '@cryptnote/api/WriteAbuseGuard',
  { error: [coded(RateLimitedError), coded(PayloadTooLargeError), coded(InvalidRequestError)] },
) {}

/** Converts schema decode failures on incoming requests to `400 InvalidRequestError`. */
export class RequestValidation extends HttpApiMiddleware.Service<RequestValidation>()(
  '@cryptnote/api/RequestValidation',
  { error: coded(InvalidRequestError) },
) {}

const entryParams = { id: EntryIdSchema };

export class NotesGroup extends HttpApiGroup.make('notes')
  .add(
    HttpApiEndpoint.get('get', '/notes/:id', {
      params: entryParams,
      success: NoteResponseSchema,
    }).annotateMerge(
      OpenApi.annotations({
        summary: 'Fetch an encrypted entry',
        description:
          'Returns the opaque ciphertext and version for the derived entry ID, or `{ entry: null }` if no entry exists.',
      }),
    ),
    HttpApiEndpoint.get('status', '/notes/:id/status', {
      params: entryParams,
      success: NoteStatusResponseSchema,
    }).annotateMerge(
      OpenApi.annotations({
        summary: 'Check entry version for background polling',
        description:
          'Returns only existence, monotonic version, and last-updated timestamp without transferring the ciphertext.',
      }),
    ),
  )
  .middleware(ReadRateLimitGuard)
  .annotateMerge(OpenApi.annotations({ title: 'Notes (Read)' })) {}

export class WritesGroup extends HttpApiGroup.make('writes')
  .add(
    HttpApiEndpoint.put('save', '/notes/:id', {
      params: entryParams,
      payload: SaveNotePayloadSchema,
      success: SaveNoteResponseSchema,
      error: [
        coded(ChallengeError),
        coded(ConflictError),
        coded(PayloadTooLargeError),
        coded(RateLimitedError),
        coded(InvalidRequestError),
      ],
    }).annotateMerge(
      OpenApi.annotations({
        summary: 'Save an encrypted entry',
        description: `Creates or replaces the opaque ciphertext for an entry ID after verifying a one-time adaptive Proof-of-Work challenge. Capped at ${MAX_ENCRYPTED_BYTES} encrypted bytes.`,
      }),
    ),
  )
  .middleware(WriteAbuseGuard)
  .annotateMerge(OpenApi.annotations({ title: 'Notes (Write)' })) {}

export class ChallengeGroup extends HttpApiGroup.make('challenge')
  .add(
    HttpApiEndpoint.post('issue', '/challenge', {
      success: ChallengeResponseSchema,
    }).annotateMerge(
      OpenApi.annotations({
        summary: 'Request an adaptive Proof-of-Work challenge',
        description:
          'Issues a one-time challenge whose difficulty adapts to recent write traffic across the service.',
      }),
    ),
  )
  .middleware(ChallengeRateLimitGuard)
  .annotateMerge(OpenApi.annotations({ title: 'Proof of Work' })) {}

export class CryptNoteApi extends HttpApi.make('cryptnote')
  .add(NotesGroup)
  .add(WritesGroup)
  .add(ChallengeGroup)
  .middleware(RequestValidation)
  .prefix('/api/v1')
  .annotateMerge(
    OpenApi.annotations({
      title: 'CryptNote API',
      version: '1.0.0',
      description:
        'Zero-knowledge encrypted notepad storage API. The server only ever sees opaque derived IDs and authenticated ciphertext.',
    }),
  ) {}

/**
 * HTTP guards implementing the API package's rate limiting, body size cap, media-type checks,
 * and schema validation error conversion.
 */

import {
  ChallengeRateLimitGuard,
  InvalidRequestError,
  MAX_SAVE_REQUEST_BYTES,
  PayloadTooLargeError,
  RateLimitedError,
  ReadRateLimitGuard,
  RequestValidation,
  WriteAbuseGuard,
} from '@cryptnote/api';
import { MAX_ENCRYPTED_BYTES } from '@cryptnote/crypto/constants';
import * as Effect from 'effect/Effect';
import * as HttpServerRequest from 'effect/http/HttpServerRequest';
import * as HttpApiMiddleware from 'effect/http-api/HttpApiMiddleware';
import * as Layer from 'effect/Layer';
import { clientKey, RateLimits } from '../platform/rate-limits.ts';

const CONTENT_LENGTH_DIGITS = /^\d+$/u;

const ReadRateLimitGuardLive = Layer.effect(
  ReadRateLimitGuard,
  Effect.gen(function* () {
    const limits = yield* RateLimits;
    return ReadRateLimitGuard.of(
      Effect.fn(function* (httpEffect) {
        const { headers } = yield* HttpServerRequest.HttpServerRequest;
        if (!(yield* limits.allows('read', clientKey(headers['cf-connecting-ip'])))) {
          return yield* new RateLimitedError({
            retryAfterSeconds: 60,
            message: 'Too many read requests from this connection. Wait a moment and try again.',
          });
        }
        return yield* httpEffect;
      }),
    );
  }),
);

const ChallengeRateLimitGuardLive = Layer.effect(
  ChallengeRateLimitGuard,
  Effect.gen(function* () {
    const limits = yield* RateLimits;
    return ChallengeRateLimitGuard.of(
      Effect.fn(function* (httpEffect) {
        const { headers } = yield* HttpServerRequest.HttpServerRequest;
        if (!(yield* limits.allows('challenge', clientKey(headers['cf-connecting-ip'])))) {
          return yield* new RateLimitedError({
            retryAfterSeconds: 60,
            message: 'Too many save challenges requested. Wait a moment and try again.',
          });
        }
        return yield* httpEffect;
      }),
    );
  }),
);

const WriteAbuseGuardLive = Layer.effect(
  WriteAbuseGuard,
  Effect.gen(function* () {
    const limits = yield* RateLimits;
    return WriteAbuseGuard.of(
      Effect.fn(function* (httpEffect) {
        const { headers, url } = yield* HttpServerRequest.HttpServerRequest;
        if (!(yield* limits.allows('write', clientKey(headers['cf-connecting-ip'])))) {
          return yield* new RateLimitedError({
            retryAfterSeconds: 60,
            message: 'Too many saves from this connection. Wait a minute and try again.',
          });
        }
        if (url.includes('?')) {
          return yield* new InvalidRequestError({
            message: 'Do not send entry data in the URL query string.',
          });
        }
        const contentLength = headers['content-length'];
        if (contentLength === undefined || !CONTENT_LENGTH_DIGITS.test(contentLength)) {
          return yield* new InvalidRequestError({
            message: 'Include a valid numeric `Content-Length` header on save requests.',
          });
        }
        if (Number(contentLength) > MAX_SAVE_REQUEST_BYTES) {
          return yield* new PayloadTooLargeError({
            maxBytes: MAX_ENCRYPTED_BYTES,
            message: `Encrypted entry exceeds the ${MAX_ENCRYPTED_BYTES}-byte (256 KiB) limit.`,
          });
        }
        const mediaType = headers['content-type']?.split(';')[0]?.trim().toLowerCase();
        if (mediaType !== 'application/json') {
          return yield* new InvalidRequestError({
            message: 'Send the save body as JSON with `Content-Type: application/json`.',
          });
        }
        return yield* httpEffect;
      }),
    );
  }),
);

const RequestValidationLive = HttpApiMiddleware.layerSchemaErrorTransform(
  RequestValidation,
  error =>
    error.kind === 'Body' || error.kind === 'ResponseHeaders'
      ? Effect.die(error)
      : Effect.fail(
          new InvalidRequestError({
            message:
              'Invalid request parameters or payload. Check the entry ID, ciphertext format, and challenge fields.',
          }),
        ),
);

export const GuardsLive = Layer.mergeAll(
  ReadRateLimitGuardLive,
  ChallengeRateLimitGuardLive,
  WriteAbuseGuardLive,
  RequestValidationLive,
);

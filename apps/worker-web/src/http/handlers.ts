import { CryptNoteApi } from '@cryptnote/api';
import * as Effect from 'effect/Effect';
import * as HttpServerRequest from 'effect/http/HttpServerRequest';
import * as HttpApiBuilder from 'effect/http-api/HttpApiBuilder';
import * as Layer from 'effect/Layer';
import { clientKey } from '../platform/rate-limits.ts';
import { Notes } from '../services/notes.ts';

const NotesHandlers = HttpApiBuilder.group(
  CryptNoteApi,
  'notes',
  Effect.fn(function* (handlers) {
    const notes = yield* Notes;
    return handlers.handleAll({
      get: ({ params: { id } }) => notes.get(id),
      status: ({ params: { id } }) => notes.status(id),
    });
  }),
);

const WritesHandlers = HttpApiBuilder.group(
  CryptNoteApi,
  'writes',
  Effect.fn(function* (handlers) {
    const notes = yield* Notes;
    return handlers.handleAll({
      save: ({ params: { id }, payload }) =>
        Effect.gen(function* () {
          const { headers } = yield* HttpServerRequest.HttpServerRequest;
          return yield* notes.save({
            id,
            ...payload,
            clientId: clientKey(headers['cf-connecting-ip']),
          });
        }),
    });
  }),
);

const ChallengeHandlers = HttpApiBuilder.group(
  CryptNoteApi,
  'challenge',
  Effect.fn(function* (handlers) {
    const notes = yield* Notes;
    return handlers.handleAll({
      issue: () => notes.issueChallenge,
    });
  }),
);

export const ApiHandlers = Layer.mergeAll(NotesHandlers, WritesHandlers, ChallengeHandlers);

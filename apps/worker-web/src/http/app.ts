/**
 * The Worker answers `/api/*` only; static SPA assets sit beside it on the same origin, so nothing
 * here needs CORS.
 */
import { CryptNoteApi } from '@cryptnote/api';
import { ErrorContract } from '@internal/effect-worker';
import * as Effect from 'effect/Effect';
import * as HttpRouter from 'effect/http/HttpRouter';
import * as HttpServer from 'effect/http/HttpServer';
import * as HttpServerResponse from 'effect/http/HttpServerResponse';
import * as HttpApiBuilder from 'effect/http-api/HttpApiBuilder';
import * as Layer from 'effect/Layer';
import { GuardsLive } from './guards.ts';
import { ApiHandlers } from './handlers.ts';

const ApiLive = HttpApiBuilder.layer(CryptNoteApi).pipe(
  Layer.provide(ApiHandlers.pipe(Layer.provideMerge(GuardsLive))),
);

const HealthRoute = HttpRouter.add(
  'GET',
  '/api/health',
  Effect.sync(() => HttpServerResponse.jsonUnsafe({ name: 'cryptnote', status: 'ok' })),
);

export const HttpApp = Layer.mergeAll(ApiLive, HealthRoute).pipe(
  Layer.provide(ErrorContract),
  Layer.provide(HttpServer.layerServices),
);

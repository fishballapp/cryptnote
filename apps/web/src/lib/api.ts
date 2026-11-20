// Typed Effect HttpApi client derived directly from `@cryptnote/api`.
import { CryptNoteApi } from '@cryptnote/api';
import * as Effect from 'effect/Effect';
import * as FetchHttpClient from 'effect/http/FetchHttpClient';
import * as HttpClient from 'effect/http/HttpClient';
import * as HttpClientError from 'effect/http/HttpClientError';
import * as Layer from 'effect/Layer';
import * as Atom from 'effect/reactivity/Atom';
import * as AtomHttpApi from 'effect/reactivity/AtomHttpApi';
import * as Schema from 'effect/Schema';

// Never propagate b3 / traceparent headers from the SPA.
Atom.runtime.addGlobalLayer(Layer.succeed(HttpClient.TracerPropagationEnabled, false));

export class ApiClient extends AtomHttpApi.Service<ApiClient>()('@cryptnote/web/ApiClient', {
  api: CryptNoteApi,
  httpClient: FetchHttpClient.layer,
  baseUrl: typeof window === 'undefined' ? 'http://localhost' : window.location.origin,
}) {}

/** Turns transport and schema errors into defects so the UI only displays API error messages. */
export const faultsAsDefects = <A, E, R>(
  effect: Effect.Effect<A, E | HttpClientError.HttpClientError | Schema.SchemaError, R>,
): Effect.Effect<A, E, R> =>
  Effect.catchIf(
    effect,
    (error): error is HttpClientError.HttpClientError | Schema.SchemaError =>
      HttpClientError.isHttpClientError(error) || Schema.isSchemaError(error),
    Effect.die,
  );

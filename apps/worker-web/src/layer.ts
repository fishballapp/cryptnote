// runtime.ts builds this over live Cloudflare bindings; test-support.ts builds it over an
// in-memory SQLite D1 and fake rate-limit bindings.
import * as D1Client from '@effect/sql-d1/D1Client';
import * as Layer from 'effect/Layer';
import * as Str from 'effect/String';
import type { RateLimits } from './platform/rate-limits.ts';
import { Notes } from './services/notes.ts';

export const makeWorkerLayer = (db: D1Database, rateLimits: Layer.Layer<RateLimits>) =>
  Notes.layer.pipe(
    Layer.provideMerge(rateLimits),
    Layer.provideMerge(D1Client.layer({ db, transformResultNames: Str.snakeToCamel })),
    Layer.orDie,
  );

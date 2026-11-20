// The only module that reads `env` from `cloudflare:workers`. Built eagerly at isolate load so no
// layer may perform I/O while constructing.
import { env } from 'cloudflare:workers';
import * as Layer from 'effect/Layer';
import * as Logger from 'effect/Logger';
import * as ManagedRuntime from 'effect/ManagedRuntime';
import { makeWorkerLayer } from './layer.ts';
import { RateLimits } from './platform/rate-limits.ts';

export const WorkerLive = makeWorkerLayer(
  env.DB,
  RateLimits.layer({
    read: env.READ_LIMIT,
    write: env.WRITE_LIMIT,
    challenge: env.CHALLENGE_LIMIT,
    create: env.CREATE_LIMIT,
  }),
).pipe(Layer.provideMerge(Logger.layer([Logger.consoleJson])));

export const runtime = ManagedRuntime.make(WorkerLive);

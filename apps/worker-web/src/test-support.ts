/// <reference types="node" />
// Tests run the real Worker code over an in-memory node:sqlite D1 with every migration applied,
// faking only the Cloudflare RateLimit bindings at the edge.
import { fileURLToPath } from 'node:url';
import { captureLogs, createTestD1 } from '@internal/effect-worker/testing';
import * as HttpRouter from 'effect/http/HttpRouter';
import * as Layer from 'effect/Layer';
import { onTestFinished } from 'vitest';
import { HttpApp } from './http/app.ts';
import { makeWorkerLayer } from './layer.ts';
import { RateLimits } from './platform/rate-limits.ts';

const migrationsDir = fileURLToPath(new URL('../migrations', import.meta.url).href);

export const fakeRateLimit = (maxCalls = 100): RateLimit & { readonly keys: string[] } => {
  const counts = new Map<string, number>();
  const keys: string[] = [];
  return {
    keys,
    limit: async ({ key }: RateLimitOptions) => {
      keys.push(key);
      const count = (counts.get(key) ?? 0) + 1;
      counts.set(key, count);
      return { success: count <= maxCalls };
    },
  };
};

export const testWorld = (options?: {
  readonly readLimit?: number;
  readonly writeLimit?: number;
  readonly challengeLimit?: number;
  readonly createLimit?: number;
}) => {
  const { sqlite, d1, beforeStatement } = createTestD1({ migrationsDir });
  const readLimit = fakeRateLimit(options?.readLimit ?? 180);
  const writeLimit = fakeRateLimit(options?.writeLimit ?? 60);
  const challengeLimit = fakeRateLimit(options?.challengeLimit ?? 90);
  const createLimit = fakeRateLimit(options?.createLimit ?? 10);
  const logging = captureLogs();

  const services = makeWorkerLayer(
    d1,
    RateLimits.layer({
      read: readLimit,
      write: writeLimit,
      challenge: challengeLimit,
      create: createLimit,
    }),
  );

  const { handler, dispose } = HttpRouter.toWebHandler(
    HttpApp.pipe(Layer.provideMerge(services), Layer.provideMerge(logging.layer)),
    { disableLogger: true },
  );
  onTestFinished(dispose);

  return {
    sqlite,
    beforeStatement,
    readLimit,
    writeLimit,
    challengeLimit,
    createLimit,
    services,
    logs: logging.logs,
    api: (path: string, init?: RequestInit) =>
      handler(
        new Request(`http://localhost${path}`, {
          ...init,
          headers: {
            'cf-connecting-ip': '203.0.113.10',
            ...(init?.headers ?? {}),
          },
        }),
      ),
  };
};

export const jsonBody = (payload: unknown, extraHeaders?: Record<string, string>): RequestInit => {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  return {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      'content-length': String(bytes.byteLength),
      ...extraHeaders,
    },
    body: bytes,
  };
};

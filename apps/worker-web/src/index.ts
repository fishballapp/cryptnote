import * as Effect from 'effect/Effect';
import * as HttpRouter from 'effect/http/HttpRouter';
import * as Layer from 'effect/Layer';
import { HttpApp } from './http/app.ts';
import { runtime, WorkerLive } from './runtime.ts';
import { Notes } from './services/notes.ts';

// Built once per isolate at module load, sharing the runtime's memoMap so `fetch` and `scheduled`
// reuse one service graph.
const { handler } = HttpRouter.toWebHandler(HttpApp.pipe(Layer.provideMerge(WorkerLive)), {
  memoMap: runtime.memoMap,
  disableLogger: true,
});

export default {
  // Only `/api/*` reaches this Worker (wrangler.jsonc); static assets and SPA fallback are served
  // directly by Cloudflare Workers Static Assets.
  fetch: request => handler(request),
  scheduled: async () => {
    await runtime.runPromise(
      Effect.gen(function* () {
        const notes = yield* Notes;
        yield* notes.sweep;
      }),
    );
  },
} satisfies ExportedHandler<Env>;

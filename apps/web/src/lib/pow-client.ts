import { type PowChallenge, type PowSolution, solvePow } from '@cryptnote/crypto/pow';

let nextRequestId = 1;

/**
 * Solves a Proof-of-Work challenge off the main thread in a dedicated Web Worker so typing and
 * drawing never stutter. Falls back to synchronous solving in test environments without Workers.
 */
export const solveChallengeOffThread = (
  challenge: Pick<PowChallenge, 'nonce' | 'difficulty'>,
  signal?: AbortSignal,
): Promise<PowSolution | null> => {
  if (signal?.aborted) return Promise.resolve(null);
  if (typeof Worker === 'undefined') {
    return Promise.resolve(
      solvePow({
        nonce: challenge.nonce,
        difficulty: challenge.difficulty,
        shouldAbort: () => signal?.aborted ?? false,
      }),
    );
  }

  return new Promise(resolve => {
    const worker = new Worker(new URL('./pow-worker.ts', import.meta.url), { type: 'module' });
    const requestId = nextRequestId;
    nextRequestId += 1;

    const cleanup = () => {
      worker.terminate();
      signal?.removeEventListener('abort', onAbort);
    };

    const onAbort = () => {
      cleanup();
      resolve(null);
    };

    signal?.addEventListener('abort', onAbort, { once: true });

    worker.addEventListener(
      'message',
      (event: MessageEvent<{ id: number; solution: PowSolution | null }>) => {
        if (event.data.id !== requestId) return;
        cleanup();
        resolve(event.data.solution);
      },
    );

    worker.addEventListener('error', () => {
      cleanup();
      resolve(
        solvePow({
          nonce: challenge.nonce,
          difficulty: challenge.difficulty,
          shouldAbort: () => signal?.aborted ?? false,
        }),
      );
    });

    worker.postMessage({
      id: requestId,
      nonce: challenge.nonce,
      difficulty: challenge.difficulty,
    });
  });
};

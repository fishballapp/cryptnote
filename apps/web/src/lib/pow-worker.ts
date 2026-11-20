import { solvePow } from '@cryptnote/crypto/pow';

type PowRequest = {
  readonly id: number;
  readonly nonce: string;
  readonly difficulty: number;
};

self.addEventListener('message', (event: MessageEvent<PowRequest>) => {
  const { id, nonce, difficulty } = event.data;
  const solution = solvePow({ nonce, difficulty });
  self.postMessage({ id, solution });
});

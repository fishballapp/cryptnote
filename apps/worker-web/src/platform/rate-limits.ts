/**
 * Cloudflare Workers Rate Limiting bindings wrapped as a single Effect platform service, plus
 * IPv6 /64 normalization so one IPv6 host cannot spend a fresh allowance per address.
 */
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';

export type RateLimitKind = 'read' | 'write' | 'challenge' | 'create';

export class RateLimits extends Context.Service<
  RateLimits,
  {
    /** Counts one request against `key`'s allowance for `kind` and reports whether it is allowed. */
    readonly allows: (kind: RateLimitKind, key: string) => Effect.Effect<boolean>;
  }
>()('@cryptnote/worker-web/platform/RateLimits') {
  static readonly layer = (bindings: {
    readonly read: RateLimit;
    readonly write: RateLimit;
    readonly challenge: RateLimit;
    readonly create: RateLimit;
  }) =>
    Layer.succeed(
      RateLimits,
      RateLimits.of({
        allows: Effect.fn('RateLimits.allows')(function* (kind, key) {
          const binding = bindings[kind];
          const { success } = yield* Effect.tryPromise(() => binding.limit({ key })).pipe(
            Effect.orDie,
          );
          return success;
        }),
      }),
    );
}

const IPV6_GROUPS = 8;

/**
 * Derives the rate-limit bucket key from Cloudflare's `cf-connecting-ip` header. IPv6 clients are
 * grouped by their `/64` prefix so a single host cannot bypass limits by rotating interface IDs.
 */
export const clientKey = (ip: string | undefined): string => {
  if (ip === undefined || ip === '') return 'no-client-ip';
  if (!ip.includes(':')) return ip;
  const [head = '', tail] = ip.split('::');
  const leading = head === '' ? [] : head.split(':');
  const trailing = tail === undefined || tail === '' ? [] : tail.split(':');
  const zeros = Array.from(
    {
      length: tail === undefined ? 0 : Math.max(0, IPV6_GROUPS - leading.length - trailing.length),
    },
    () => '0',
  );
  return `${[...leading, ...zeros, ...trailing]
    .slice(0, 4)
    .map(group => group.toLowerCase().padStart(4, '0'))
    .join(':')}::/64`;
};

/** Formats a byte count cleanly using KiB units matching the 256 KiB cap. */
export const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  return kb >= 100 ? `${Math.round(kb)} KB` : `${kb.toFixed(1)} KB`;
};

const relativeFormatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

/** Formats a past epoch-millisecond timestamp concisely relative to `nowMs`. */
export const formatRelativeTime = (epochMs: number, nowMs = Date.now()): string => {
  const diffSec = Math.round((epochMs - nowMs) / 1000);
  if (Math.abs(diffSec) < 45) return 'just now';
  const diffMin = Math.round(diffSec / 60);
  if (Math.abs(diffMin) < 60) return relativeFormatter.format(diffMin, 'minute');
  const diffHr = Math.round(diffMin / 60);
  if (Math.abs(diffHr) < 24) return relativeFormatter.format(diffHr, 'hour');
  const diffDays = Math.round(diffHr / 24);
  return relativeFormatter.format(diffDays, 'day');
};

/** Exact local timestamp for `<time title>` tooltips via `Temporal.Instant`. */
export const formatExactTime = (epochMs: number): string =>
  Temporal.Instant.fromEpochMilliseconds(epochMs).toLocaleString('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

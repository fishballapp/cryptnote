/**
 * Two-state color-scheme toggle backed by `<meta name="color-scheme">` and `localStorage`.
 * Follows the modern-web-guidance pattern: stores an explicit override only when it differs from
 * the current OS scheme, removes the override when toggling back to match the OS, and syncs across
 * tabs via the `storage` event.
 */

const STORAGE_KEY = 'cryptnote-color-scheme';

export type ResolvedScheme = 'light' | 'dark';

const systemScheme = (): ResolvedScheme => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

export const readStoredScheme = (): ResolvedScheme | null => {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
};

export const resolveActiveScheme = (): ResolvedScheme => readStoredScheme() ?? systemScheme();

export const applyColorSchemeMeta = (stored: ResolvedScheme | null): void => {
  if (typeof document === 'undefined') return;
  const meta = document.querySelector('meta[name="color-scheme"]');
  if (meta !== null) meta.setAttribute('content', stored ?? 'light dark');
};

/** Toggles to the opposite of the currently rendered scheme and returns the new resolved scheme. */
export const toggleColorScheme = (): ResolvedScheme => {
  const current = resolveActiveScheme();
  const target: ResolvedScheme = current === 'dark' ? 'light' : 'dark';
  const nextStored = target === systemScheme() ? null : target;
  try {
    if (nextStored === null) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, nextStored);
    }
  } catch {
    // Storage blocked; still apply the meta override for this session.
  }
  applyColorSchemeMeta(nextStored);
  return target;
};

/** Subscribes to OS scheme changes and cross-tab localStorage updates. */
export const subscribeColorScheme = (onChange: (scheme: ResolvedScheme) => void): (() => void) => {
  if (typeof window === 'undefined') return () => {};
  const media =
    typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)')
      : null;

  const sync = () => {
    const stored = readStoredScheme();
    applyColorSchemeMeta(stored);
    onChange(stored ?? systemScheme());
  };

  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) sync();
  };

  media?.addEventListener('change', sync);
  window.addEventListener('storage', onStorage);
  return () => {
    media?.removeEventListener('change', sync);
    window.removeEventListener('storage', onStorage);
  };
};

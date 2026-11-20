import { estimateEncryptedBytes, isDocumentEmpty, MAX_ENCRYPTED_BYTES } from '@cryptnote/crypto';
import { useAtomSet } from '@effect/atom-react';
import * as Cause from 'effect/Cause';
import * as Exit from 'effect/Exit';
import * as Predicate from 'effect/Predicate';
import { useCallback, useEffect, useRef } from 'react';
import { messageFromCause, openEntryAtom, pollStatusAtom, saveEntryAtom } from './entry-atoms.ts';
import { useWorkspaceStore } from './workspace-store.ts';

const TITLE_LOAD_DEBOUNCE_MS = 320;
const AUTOSAVE_DEBOUNCE_MS = 1000;
const POLL_INTERVAL_MS = 10_000;

const extractConflictVersion = (cause: Cause.Cause<unknown>): number | null => {
  const failure = Cause.squash(cause);
  if (!Predicate.isTagged(failure, 'ConflictError')) return null;
  const record = failure as { readonly currentVersion?: unknown };
  return typeof record.currentVersion === 'number' ? record.currentVersion : null;
};

/**
 * Coordinates debounced zero-knowledge entry loading, optimistic-concurrency autosaving with
 * off-thread PoW, leave-flushing, and background polling for remote saves from other devices.
 */
export const useEntrySync = () => {
  const title = useWorkspaceStore(state => state.title);
  const keys = useWorkspaceStore(state => state.keys);
  const document = useWorkspaceStore(state => state.document);
  const syncStatus = useWorkspaceStore(state => state.syncStatus);
  const savedVersion = useWorkspaceStore(state => state.savedVersion);
  const isDirty = useWorkspaceStore(state => state.isDirty);
  const isServerAhead = useWorkspaceStore(state => state.isServerAhead);

  const openEntry = useAtomSet(openEntryAtom, { mode: 'promiseExit' });
  const saveEntry = useAtomSet(saveEntryAtom, { mode: 'promiseExit' });
  const pollStatus = useAtomSet(pollStatusAtom, { mode: 'promiseExit' });

  const loadGenerationRef = useRef(0);
  // Track in-flight saves per entryId so a background flush for an old entry never strands a new one.
  const savingEntryIdsRef = useRef(new Set<string>());

  const loadTitle = useCallback(
    async (targetTitle: string, forceReplace: boolean) => {
      const generation = loadGenerationRef.current + 1;
      loadGenerationRef.current = generation;
      useWorkspaceStore.getState().markLoading();

      const exit = await openEntry({ title: targetTitle });
      if (
        loadGenerationRef.current !== generation ||
        useWorkspaceStore.getState().title !== targetTitle
      ) {
        return;
      }

      if (Exit.isSuccess(exit)) {
        useWorkspaceStore.getState().applyLoaded({ ...exit.value, forceReplace });
        return;
      }
      useWorkspaceStore
        .getState()
        .applyLoadError(
          messageFromCause(
            exit.cause,
            'Could not load this entry. Check your connection and retry.',
          ),
        );
    },
    [openEntry],
  );

  // Invalidate any in-flight load immediately on every title change, then debounce the next load.
  useEffect(() => {
    loadGenerationRef.current += 1;
    if (title.length === 0) return;
    const targetTitle = title;
    const timer = window.setTimeout(() => {
      void loadTitle(targetTitle, false);
    }, TITLE_LOAD_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [title, loadTitle]);

  const saveNow = useCallback(
    async (options?: { readonly overrideVersion?: number | null }) => {
      const state = useWorkspaceStore.getState();
      if (state.keys === null || state.title.length === 0 || state.syncStatus === 'loading') return;

      const entryId = state.keys.entryId;
      if (savingEntryIdsRef.current.has(entryId)) return;

      const hasOverride = options !== undefined && 'overrideVersion' in options;
      if (!hasOverride && state.isServerAhead) return;

      const estimatedBytes = estimateEncryptedBytes(state.document);
      if (estimatedBytes > MAX_ENCRYPTED_BYTES) {
        state.applySaveError(
          `Encrypted entry is ${Math.ceil(estimatedBytes / 1024)} KB, over the 256 KB limit. Trim content to save.`,
        );
        return;
      }

      // Do not create an empty row on the server when browsing a brand-new title without writing.
      if (state.savedVersion === null && !hasOverride && isDocumentEmpty(state.document)) {
        return;
      }

      const expectedVersion = hasOverride ? (options.overrideVersion ?? null) : state.savedVersion;
      const activeGeneration = loadGenerationRef.current;
      const sequenceAtStart = state.editSeq;
      savingEntryIdsRef.current.add(entryId);
      state.markSaving();

      try {
        const exit = await saveEntry({
          keys: state.keys,
          document: state.document,
          expectedVersion,
        });
        if (loadGenerationRef.current !== activeGeneration) return;

        if (Exit.isSuccess(exit)) {
          const latest = useWorkspaceStore.getState();
          latest.applySaved({
            version: exit.value.version,
            updatedAt: exit.value.updatedAt,
            shouldClearDirty: latest.editSeq === sequenceAtStart,
          });
          return;
        }

        const conflictVersion = extractConflictVersion(exit.cause);
        if (conflictVersion !== null) {
          useWorkspaceStore
            .getState()
            .markServerAhead(conflictVersion > 0 ? conflictVersion : null);
          return;
        }

        useWorkspaceStore
          .getState()
          .applySaveError(
            messageFromCause(
              exit.cause,
              'Could not save right now. Your edits stay on screen — retry.',
            ),
          );
      } finally {
        savingEntryIdsRef.current.delete(entryId);
      }
    },
    [saveEntry],
  );

  /**
   * Snapshots the current dirty entry and saves it in the background before switching or closing.
   * Returns `true` if there are no unsaved edits left at risk (either clean or flushed); returns
   * `false` if dirty edits cannot be auto-flushed (over 256 KB, conflict active, or keys not ready).
   */
  const flushCurrentEntry = useCallback((): boolean => {
    const state = useWorkspaceStore.getState();
    if (!state.isDirty) return true;
    if (state.savedVersion === null && isDocumentEmpty(state.document)) return true;

    const estimatedBytes = estimateEncryptedBytes(state.document);
    if (
      state.keys === null ||
      state.isServerAhead ||
      state.syncStatus === 'loading' ||
      estimatedBytes > MAX_ENCRYPTED_BYTES
    ) {
      return false;
    }

    const entryKeys = state.keys;
    const entryDoc = state.document;
    const expectedVersion = state.savedVersion;
    if (savingEntryIdsRef.current.has(entryKeys.entryId)) return true;

    savingEntryIdsRef.current.add(entryKeys.entryId);
    void saveEntry({ keys: entryKeys, document: entryDoc, expectedVersion }).finally(() => {
      savingEntryIdsRef.current.delete(entryKeys.entryId);
    });
    return true;
  }, [saveEntry]);

  // Debounced autosave whenever the open document becomes dirty (paused while server is ahead).
  useEffect(() => {
    if (
      !isDirty ||
      isServerAhead ||
      keys === null ||
      syncStatus === 'loading' ||
      syncStatus === 'saving'
    ) {
      return;
    }
    const estimatedBytes = estimateEncryptedBytes(document);
    if (estimatedBytes > MAX_ENCRYPTED_BYTES) return;
    if (savedVersion === null && isDocumentEmpty(document)) return;

    const timer = window.setTimeout(() => {
      void saveNow();
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [isDirty, isServerAhead, keys, document, syncStatus, savedVersion, saveNow]);

  // Warn before closing or reloading the browser tab while edits are unsaved or mid-save.
  useEffect(() => {
    if (!isDirty && syncStatus !== 'saving') return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty, syncStatus]);

  // Global Cmd/Ctrl+S shortcut triggers an immediate save.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void saveNow();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [saveNow]);

  // Background polling for remote saves from other devices.
  useEffect(() => {
    if (keys === null) return;
    const activeEntryId = keys.entryId;
    const activeGeneration = loadGenerationRef.current;

    const checkOnce = async () => {
      if (typeof window === 'undefined' || window.document.visibilityState === 'hidden') return;
      const state = useWorkspaceStore.getState();
      if (
        state.keys?.entryId !== activeEntryId ||
        state.syncStatus === 'loading' ||
        state.syncStatus === 'saving' ||
        savingEntryIdsRef.current.has(activeEntryId)
      ) {
        return;
      }
      const exit = await pollStatus({ entryId: activeEntryId });
      if (loadGenerationRef.current !== activeGeneration || !Exit.isSuccess(exit)) return;

      const latest = useWorkspaceStore.getState();
      if (
        latest.keys?.entryId !== activeEntryId ||
        latest.syncStatus === 'saving' ||
        savingEntryIdsRef.current.has(activeEntryId)
      ) {
        return;
      }

      const remote = exit.value;
      const hasNewerVersion =
        remote.exists && remote.version !== null && remote.version > (latest.savedVersion ?? 0);
      if (hasNewerVersion) {
        latest.markServerAhead(remote.version);
      }
    };

    const intervalId = window.setInterval(() => {
      void checkOnce();
    }, POLL_INTERVAL_MS);

    const onVisibilityChange = () => {
      if (window.document.visibilityState === 'visible') void checkOnce();
    };
    window.document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [keys, pollStatus]);

  const refreshFromServer = useCallback(() => {
    const currentTitle = useWorkspaceStore.getState().title;
    if (currentTitle.length === 0) return;
    void loadTitle(currentTitle, true);
  }, [loadTitle]);

  const keepLocalVersion = useCallback(() => {
    const { remoteVersion } = useWorkspaceStore.getState();
    void saveNow({ overrideVersion: remoteVersion });
  }, [saveNow]);

  const retrySync = useCallback(() => {
    const state = useWorkspaceStore.getState();
    if (state.errorKind === 'load' || state.keys === null) {
      refreshFromServer();
      return;
    }
    void saveNow();
  }, [refreshFromServer, saveNow]);

  return {
    saveNow,
    refreshFromServer,
    keepLocalVersion,
    flushCurrentEntry,
    retrySync,
  };
};

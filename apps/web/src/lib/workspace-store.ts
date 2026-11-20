import {
  addTab,
  createEmptyDocument,
  type EntryDocument,
  type EntryKeys,
  type EntryTab,
  removeTab,
  type TabKind,
  updateTab,
} from '@cryptnote/crypto';
import { create } from 'zustand';

export type SyncStatus = 'idle' | 'loading' | 'saving' | 'saved' | 'error';
export type SyncErrorKind = 'load' | 'save';

type WorkspaceState = {
  readonly title: string;
  readonly isTitleMasked: boolean;
  readonly keys: EntryKeys | null;
  readonly document: EntryDocument;
  readonly activeTab: TabKind;
  readonly splitTab: TabKind | null;
  readonly isSplitMode: boolean;
  readonly syncStatus: SyncStatus;
  readonly errorKind: SyncErrorKind | null;
  readonly errorMessage: string | null;
  readonly savedVersion: number | null;
  readonly lastSavedAt: number | null;
  readonly isDirty: boolean;
  readonly editSeq: number;
  readonly isServerAhead: boolean;
  readonly remoteVersion: number | null;

  readonly setTitle: (title: string) => void;
  readonly toggleTitleMasked: () => void;
  readonly clearEntry: () => void;
  readonly markLoading: () => void;
  readonly applyLoaded: (loaded: {
    readonly keys: EntryKeys;
    readonly document: EntryDocument;
    readonly version: number | null;
    readonly updatedAt: number | null;
    readonly forceReplace?: boolean;
  }) => void;
  readonly applyLoadError: (message: string) => void;
  readonly editTab: (tab: EntryTab) => void;
  readonly addEntryTab: (kind: TabKind) => void;
  readonly removeEntryTab: (kind: TabKind) => void;
  readonly setActiveTab: (kind: TabKind) => void;
  readonly setSplitTab: (kind: TabKind) => void;
  readonly toggleSplitMode: () => void;
  readonly markSaving: () => void;
  readonly applySaved: (saved: {
    readonly version: number;
    readonly updatedAt: number;
    readonly shouldClearDirty: boolean;
  }) => void;
  readonly applySaveError: (message: string) => void;
  readonly markServerAhead: (remoteVersion: number | null) => void;
  readonly clearError: () => void;
};

const pickAlternateTab = (tabs: readonly EntryTab[], primary: TabKind): TabKind | null =>
  tabs.find(tab => tab.kind !== primary)?.kind ?? null;

const initialState = () => ({
  title: '',
  isTitleMasked: false,
  keys: null as EntryKeys | null,
  document: createEmptyDocument(),
  activeTab: 'note' as TabKind,
  splitTab: null as TabKind | null,
  isSplitMode: false,
  syncStatus: 'idle' as SyncStatus,
  errorKind: null as SyncErrorKind | null,
  errorMessage: null as string | null,
  savedVersion: null as number | null,
  lastSavedAt: null as number | null,
  isDirty: false,
  editSeq: 0,
  isServerAhead: false,
  remoteVersion: null as number | null,
});

export const useWorkspaceStore = create<WorkspaceState>(set => ({
  ...initialState(),

  setTitle: title =>
    set(state => {
      if (title === state.title) return state;
      return {
        title,
        keys: null,
        document: createEmptyDocument(),
        activeTab: 'note' as TabKind,
        splitTab: null,
        isSplitMode: false,
        syncStatus: 'idle' as SyncStatus,
        errorKind: null,
        errorMessage: null,
        savedVersion: null,
        lastSavedAt: null,
        isDirty: false,
        isServerAhead: false,
        remoteVersion: null,
      };
    }),

  toggleTitleMasked: () => set(state => ({ isTitleMasked: !state.isTitleMasked })),

  clearEntry: () =>
    set(state => ({
      ...initialState(),
      isTitleMasked: state.isTitleMasked,
    })),

  markLoading: () =>
    set({
      syncStatus: 'loading',
      errorKind: null,
      errorMessage: null,
      isServerAhead: false,
    }),

  applyLoaded: ({ keys, document, version, updatedAt, forceReplace = false }) =>
    set(state => {
      if (!forceReplace && state.isDirty) {
        // User edited locally before the initial lookup finished.
        if (version === null) {
          // Brand-new title on the server: keep local edits and attach keys so autosave persists.
          return {
            keys,
            syncStatus: 'idle',
            errorKind: null,
            errorMessage: null,
            savedVersion: null,
            lastSavedAt: null,
            isServerAhead: false,
            remoteVersion: null,
          };
        }
        // Existing entry on the server: preserve local draft and surface an explicit conflict
        // choice ("Load newer version" / "Keep mine") rather than silently overwriting edits.
        return {
          keys,
          syncStatus: 'idle',
          errorKind: null,
          errorMessage: null,
          savedVersion: null,
          lastSavedAt: updatedAt,
          isServerAhead: true,
          remoteVersion: version,
        };
      }
      const hasCurrentActive = document.tabs.some(tab => tab.kind === state.activeTab);
      const activeTab = hasCurrentActive ? state.activeTab : (document.tabs[0]?.kind ?? 'note');
      const hasCurrentSplit =
        state.splitTab !== null &&
        state.splitTab !== activeTab &&
        document.tabs.some(tab => tab.kind === state.splitTab);
      const splitTab = hasCurrentSplit
        ? state.splitTab
        : pickAlternateTab(document.tabs, activeTab);
      return {
        keys,
        document,
        activeTab,
        splitTab,
        isSplitMode: state.isSplitMode && document.tabs.length >= 2,
        syncStatus: version === null ? 'idle' : 'saved',
        errorKind: null,
        errorMessage: null,
        savedVersion: version,
        lastSavedAt: updatedAt,
        isDirty: false,
        isServerAhead: false,
        remoteVersion: version,
      };
    }),

  applyLoadError: message =>
    set({
      syncStatus: 'error',
      errorKind: 'load',
      errorMessage: message,
    }),

  editTab: tab =>
    set(state => ({
      document: updateTab(state.document, tab),
      isDirty: true,
      editSeq: state.editSeq + 1,
      errorKind: null,
      errorMessage: null,
    })),

  addEntryTab: kind =>
    set(state => {
      const next = addTab(state.document, kind);
      if (next === state.document) return state;
      return {
        document: next,
        activeTab: state.isSplitMode ? state.activeTab : kind,
        splitTab: state.isSplitMode ? kind : (state.splitTab ?? pickAlternateTab(next.tabs, kind)),
        isDirty: true,
        editSeq: state.editSeq + 1,
        errorKind: null,
        errorMessage: null,
      };
    }),

  removeEntryTab: kind =>
    set(state => {
      const next = removeTab(state.document, kind);
      if (next === state.document) return state;
      const activeTab = state.activeTab === kind ? (next.tabs[0]?.kind ?? 'note') : state.activeTab;
      const splitTab =
        state.splitTab === kind || state.splitTab === activeTab
          ? pickAlternateTab(next.tabs, activeTab)
          : state.splitTab;
      return {
        document: next,
        activeTab,
        splitTab,
        isSplitMode: state.isSplitMode && next.tabs.length >= 2,
        isDirty: true,
        editSeq: state.editSeq + 1,
        errorKind: null,
        errorMessage: null,
      };
    }),

  setActiveTab: kind =>
    set(state => ({
      activeTab: kind,
      splitTab:
        state.splitTab === kind ? pickAlternateTab(state.document.tabs, kind) : state.splitTab,
    })),

  setSplitTab: kind =>
    set(state => ({
      splitTab: kind === state.activeTab ? state.splitTab : kind,
    })),

  toggleSplitMode: () =>
    set(state => {
      if (state.document.tabs.length < 2) return { isSplitMode: false, splitTab: null };
      const nextMode = !state.isSplitMode;
      const nextSplit = (() => {
        if (!nextMode) return state.splitTab;
        if (state.splitTab !== null && state.splitTab !== state.activeTab) return state.splitTab;
        return pickAlternateTab(state.document.tabs, state.activeTab);
      })();
      return {
        isSplitMode: nextMode,
        splitTab: nextSplit,
      };
    }),

  markSaving: () =>
    set({
      syncStatus: 'saving',
      errorKind: null,
      errorMessage: null,
    }),

  applySaved: ({ version, updatedAt, shouldClearDirty }) =>
    set({
      syncStatus: 'saved',
      errorKind: null,
      errorMessage: null,
      savedVersion: version,
      lastSavedAt: updatedAt,
      isDirty: !shouldClearDirty,
      isServerAhead: false,
      remoteVersion: version,
    }),

  applySaveError: message =>
    set({
      syncStatus: 'error',
      errorKind: 'save',
      errorMessage: message,
    }),

  markServerAhead: remoteVersion =>
    set(state => ({
      syncStatus: state.syncStatus === 'saving' ? 'idle' : state.syncStatus,
      isServerAhead: true,
      remoteVersion,
    })),

  clearError: () => set({ errorKind: null, errorMessage: null }),
}));

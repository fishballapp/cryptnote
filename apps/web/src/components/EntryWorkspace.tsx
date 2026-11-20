import { type EntryTab, MAX_ENCRYPTED_BYTES, type TabKind } from '@cryptnote/crypto';
import { ArrowsClockwiseIcon, WarningCircleIcon } from '@phosphor-icons/react';
import { cn } from 'cn';
import { formatBytes, formatExactTime, formatRelativeTime } from '../lib/format.ts';
import { TAB_META } from '../lib/tab-meta.ts';
import { useWorkspaceStore } from '../lib/workspace-store.ts';
import { EntryTabBar } from './EntryTabBar.tsx';
import { BookmarksTabEditor } from './tabs/BookmarksTabEditor.tsx';
import { ChecklistTabEditor } from './tabs/ChecklistTabEditor.tsx';
import { CodeTabEditor } from './tabs/CodeTabEditor.tsx';
import { DrawingTabEditor } from './tabs/DrawingTabEditor.tsx';
import { NoteTabEditor } from './tabs/NoteTabEditor.tsx';
import { Button } from './ui/Button.tsx';
import { Select, SizeMeter, TabPanel, TabsRoot } from './ui/Primitives.tsx';

function TabEditorSurface({
  tab,
  onChange,
}: {
  readonly tab: EntryTab;
  readonly onChange: (next: EntryTab) => void;
}) {
  switch (tab.kind) {
    case 'note':
      return <NoteTabEditor tab={tab} onChange={onChange} />;
    case 'checklist':
      return <ChecklistTabEditor tab={tab} onChange={onChange} />;
    case 'bookmarks':
      return <BookmarksTabEditor tab={tab} onChange={onChange} />;
    case 'drawing':
      return <DrawingTabEditor tab={tab} onChange={onChange} />;
    case 'code':
      return <CodeTabEditor tab={tab} onChange={onChange} />;
  }
}

export function EntryWorkspace({
  estimatedBytes,
  onRetry,
  onRefresh,
  onKeepMine,
}: {
  readonly estimatedBytes: number;
  readonly onRetry: () => void;
  readonly onRefresh: () => void;
  readonly onKeepMine: () => void;
}) {
  const document = useWorkspaceStore(state => state.document);
  const activeTab = useWorkspaceStore(state => state.activeTab);
  const splitTab = useWorkspaceStore(state => state.splitTab);
  const isSplitMode = useWorkspaceStore(state => state.isSplitMode);
  const syncStatus = useWorkspaceStore(state => state.syncStatus);
  const errorMessage = useWorkspaceStore(state => state.errorMessage);
  const isDirty = useWorkspaceStore(state => state.isDirty);
  const isServerAhead = useWorkspaceStore(state => state.isServerAhead);
  const savedVersion = useWorkspaceStore(state => state.savedVersion);
  const lastSavedAt = useWorkspaceStore(state => state.lastSavedAt);
  const editTab = useWorkspaceStore(state => state.editTab);
  const setActiveTab = useWorkspaceStore(state => state.setActiveTab);
  const setSplitTab = useWorkspaceStore(state => state.setSplitTab);

  const isOverLimit = estimatedBytes > MAX_ENCRYPTED_BYTES;
  const usageRatio = estimatedBytes / MAX_ENCRYPTED_BYTES;
  const meterTone = (() => {
    if (isOverLimit) return 'danger' as const;
    if (usageRatio >= 0.75) return 'warn' as const;
    return 'normal' as const;
  })();

  const alertBanner = (() => {
    if (isOverLimit) {
      return (
        <div
          role="alert"
          className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-danger/35 bg-danger-soft px-4 py-2.5 text-sm text-danger sm:rounded-xl sm:border"
        >
          <div className="flex items-center gap-2">
            <WarningCircleIcon className="size-4 shrink-0" aria-hidden="true" />
            <span>
              Entry is {formatBytes(estimatedBytes)} encrypted — trim{' '}
              {formatBytes(estimatedBytes - MAX_ENCRYPTED_BYTES)} to stay under the 256 KB limit.
              Autosave is paused until trimmed.
            </span>
          </div>
        </div>
      );
    }
    if (errorMessage !== null) {
      return (
        <div
          role="alert"
          className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-danger/35 bg-danger-soft px-4 py-2.5 text-sm text-danger sm:rounded-xl sm:border"
        >
          <div className="flex items-center gap-2">
            <WarningCircleIcon className="size-4 shrink-0" aria-hidden="true" />
            <span>{errorMessage}</span>
          </div>
          <Button variant="danger" size="sm" onClick={onRetry}>
            Retry
          </Button>
        </div>
      );
    }
    return null;
  })();

  const footerStatus = (() => {
    if (syncStatus === 'saving') return <span>Encrypting &amp; saving…</span>;
    if (lastSavedAt !== null) {
      return (
        <time
          dateTime={Temporal.Instant.fromEpochMilliseconds(lastSavedAt).toString()}
          title={formatExactTime(lastSavedAt)}
        >
          Saved {formatRelativeTime(lastSavedAt)}
        </time>
      );
    }
    if (isDirty) return <span>Unsaved edits</span>;
    return <span>New entry</span>;
  })();

  const secondaryTab =
    isSplitMode && splitTab !== null
      ? (document.tabs.find(tab => tab.kind === splitTab) ?? null)
      : null;

  const splitOptions = document.tabs
    .filter(tab => tab.kind !== activeTab)
    .map(tab => ({ value: tab.kind, label: TAB_META[tab.kind].label }));

  return (
    <div
      className={cn(
        'mx-auto flex min-h-0 w-full flex-1 flex-col px-0 py-0 sm:px-5 sm:py-4',
        isSplitMode ? 'max-w-7xl' : 'max-w-5xl',
      )}
    >
      {isServerAhead ? (
        <div
          role="alert"
          className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-warning/35 bg-warning-soft px-4 py-2.5 text-sm text-foreground sm:rounded-xl sm:border"
        >
          <div className="flex items-center gap-2">
            <ArrowsClockwiseIcon className="size-4 shrink-0 text-warning" aria-hidden="true" />
            <span>
              {savedVersion === null
                ? 'An existing encrypted version is already stored under this title.'
                : 'A newer encrypted version was saved from another device.'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {isDirty ? (
              <Button variant="secondary" size="sm" onClick={onKeepMine}>
                Keep mine
              </Button>
            ) : null}
            <Button variant="primary" size="sm" onClick={onRefresh}>
              Load newer version
            </Button>
          </div>
        </div>
      ) : null}

      {alertBanner}

      <TabsRoot
        value={activeTab}
        onValueChange={next => setActiveTab(String(next) as TabKind)}
        className="flex min-h-0 flex-1 flex-col overflow-hidden bg-surface sm:rounded-xl sm:border sm:border-border"
      >
        <EntryTabBar />

        <div
          className={cn(
            'min-h-0 flex-1',
            secondaryTab !== null
              ? 'grid grid-cols-1 lg:grid-cols-2 lg:divide-x lg:divide-border'
              : 'flex flex-col',
          )}
        >
          <div className="flex min-h-0 flex-1 flex-col">
            {document.tabs.map(tab => (
              <TabPanel
                key={tab.kind}
                value={tab.kind}
                className="flex min-h-0 flex-1 flex-col outline-none"
              >
                <TabEditorSurface tab={tab} onChange={editTab} />
              </TabPanel>
            ))}
          </div>

          {secondaryTab !== null ? (
            <div className="hidden min-h-0 flex-col lg:flex">
              <div className="flex h-10 shrink-0 items-center justify-between border-b border-border bg-surface-sunken/35 px-4">
                <span className="text-xs font-medium text-muted">Split pane</span>
                <Select
                  value={secondaryTab.kind}
                  onValueChange={setSplitTab}
                  options={splitOptions}
                  ariaLabel="Second pane tab"
                />
              </div>
              <div className="min-h-0 flex-1">
                <TabEditorSurface tab={secondaryTab} onChange={editTab} />
              </div>
            </div>
          ) : null}
        </div>

        <footer className="flex h-9 shrink-0 items-center justify-between gap-3 border-t border-border bg-surface-sunken/40 px-4 text-xs text-muted sm:px-5">
          <div className="flex items-center gap-2.5">
            <SizeMeter value={estimatedBytes} max={MAX_ENCRYPTED_BYTES} tone={meterTone} />
            <span
              className={cn(
                'tabular',
                meterTone === 'danger' && 'font-medium text-danger',
                meterTone === 'warn' && 'font-medium text-warning',
              )}
            >
              {formatBytes(estimatedBytes)} / 256 KB
            </span>
          </div>

          <div className="flex items-center gap-3">{footerStatus}</div>
        </footer>
      </TabsRoot>
    </div>
  );
}

import { availableTabKinds, type EntryTab, isTabEmpty, type TabKind } from '@cryptnote/crypto';
import { ColumnsIcon, PlusIcon, XIcon } from '@phosphor-icons/react';
import { cn } from 'cn';
import { useState } from 'react';
import { TAB_META } from '../lib/tab-meta.ts';
import { useWorkspaceStore } from '../lib/workspace-store.ts';
import { Button } from './ui/Button.tsx';
import { ConfirmDialog } from './ui/Dialog.tsx';
import {
  MenuContent,
  MenuItem,
  MenuRoot,
  MenuTrigger,
  TabsList,
  TabTrigger,
  ToggleButton,
  Tooltip,
} from './ui/Primitives.tsx';

const tabBadge = (tab: EntryTab): string | null => {
  if (tab.kind === 'checklist' && tab.items.length > 0) {
    const done = tab.items.filter(item => item.isChecked).length;
    return `${done}/${tab.items.length}`;
  }
  if (tab.kind === 'bookmarks' && tab.items.length > 0) {
    return String(tab.items.length);
  }
  return null;
};

export function EntryTabBar() {
  const document = useWorkspaceStore(state => state.document);
  const isSplitMode = useWorkspaceStore(state => state.isSplitMode);
  const addEntryTab = useWorkspaceStore(state => state.addEntryTab);
  const removeEntryTab = useWorkspaceStore(state => state.removeEntryTab);
  const toggleSplitMode = useWorkspaceStore(state => state.toggleSplitMode);

  const [pendingRemoval, setPendingRemoval] = useState<TabKind | null>(null);
  const remainingKinds = availableTabKinds(document);
  const canRemove = document.tabs.length > 1;
  const canSplit = document.tabs.length >= 2;

  const requestRemoval = (tab: EntryTab) => {
    if (!canRemove) return;
    if (isTabEmpty(tab)) {
      removeEntryTab(tab.kind);
      return;
    }
    setPendingRemoval(tab.kind);
  };

  return (
    <div className="flex items-center justify-between gap-2 border-b border-border bg-surface-sunken/50 px-3 sm:px-5">
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        <TabsList aria-label="Entry tabs" className="flex shrink-0 items-center gap-0.5">
          {document.tabs.map(tab => {
            const meta = TAB_META[tab.kind];
            const Icon = meta.icon;
            const badge = tabBadge(tab);
            return (
              <div key={tab.kind} className="group flex shrink-0 items-center">
                <TabTrigger
                  value={tab.kind}
                  className={cn(
                    'relative inline-flex h-10 items-center gap-1.5 px-3 text-sm font-medium text-muted outline-none transition-colors hover:text-foreground aria-[selected=true]:text-foreground',
                    'after:pointer-events-none after:absolute after:inset-x-1.5 after:bottom-0 after:border-b-2 after:border-transparent aria-[selected=true]:after:border-accent',
                  )}
                >
                  <Icon className="size-4 shrink-0" aria-hidden="true" />
                  <span>{meta.label}</span>
                  {badge !== null ? (
                    <span className="tabular text-xs text-subtle">{badge}</span>
                  ) : null}
                </TabTrigger>
                {canRemove ? (
                  <button
                    type="button"
                    aria-label={`Remove ${meta.label} tab`}
                    onClick={() => requestRemoval(tab)}
                    className="-ml-1 mr-1 inline-flex size-5 items-center justify-center rounded text-subtle opacity-60 transition-opacity hover:bg-surface-sunken hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100"
                  >
                    <XIcon className="size-3" aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            );
          })}
        </TabsList>

        {remainingKinds.length > 0 ? (
          <MenuRoot>
            <MenuTrigger
              render={
                <Button variant="ghost" size="sm" aria-label="Add tab" className="ml-1 shrink-0" />
              }
            >
              <PlusIcon className="size-3.5" aria-hidden="true" />
              <span>Add tab</span>
            </MenuTrigger>
            <MenuContent align="start">
              {remainingKinds.map(kind => {
                const meta = TAB_META[kind];
                const Icon = meta.icon;
                return (
                  <MenuItem key={kind} onClick={() => addEntryTab(kind)}>
                    <Icon className="size-4 shrink-0 text-accent" aria-hidden="true" />
                    <span className="flex flex-col">
                      <span className="font-medium leading-tight">{meta.label}</span>
                      <span className="text-xs text-muted">{meta.summary}</span>
                    </span>
                  </MenuItem>
                );
              })}
            </MenuContent>
          </MenuRoot>
        ) : null}
      </div>

      {canSplit ? (
        <div className="hidden shrink-0 items-center lg:flex">
          <Tooltip content={isSplitMode ? 'Single pane view' : 'Split into two panes'}>
            <ToggleButton
              pressed={isSplitMode}
              onPressedChange={toggleSplitMode}
              ariaLabel="Toggle split pane layout"
            >
              <ColumnsIcon className="size-4" aria-hidden="true" />
              <span>Split</span>
            </ToggleButton>
          </Tooltip>
        </div>
      ) : null}

      <ConfirmDialog
        open={pendingRemoval !== null}
        onOpenChange={open => {
          if (!open) setPendingRemoval(null);
        }}
        title={pendingRemoval === null ? '' : `Remove ${TAB_META[pendingRemoval].label} tab?`}
        description="Its contents will be removed from this entry on the next save."
        confirmLabel="Remove tab"
        onConfirm={() => {
          if (pendingRemoval !== null) removeEntryTab(pendingRemoval);
        }}
      />
    </div>
  );
}

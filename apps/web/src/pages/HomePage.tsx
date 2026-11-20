import {
  estimateEncryptedBytes,
  generatePrivateTitle,
  MAX_ENCRYPTED_BYTES,
} from '@cryptnote/crypto';
import { useMemo, useRef, useState } from 'react';
import { EntryEmptyState } from '../components/EntryEmptyState.tsx';
import { EntryWorkspace } from '../components/EntryWorkspace.tsx';
import { HowItWorksDialog } from '../components/HowItWorksDialog.tsx';
import { ConfirmDialog } from '../components/ui/Dialog.tsx';
import { WorkspaceHeader } from '../components/WorkspaceHeader.tsx';
import { useEntrySync } from '../lib/use-entry-sync.ts';
import { useWorkspaceStore } from '../lib/workspace-store.ts';

export function HomePage() {
  const title = useWorkspaceStore(state => state.title);
  const document = useWorkspaceStore(state => state.document);
  const setTitle = useWorkspaceStore(state => state.setTitle);
  const clearEntry = useWorkspaceStore(state => state.clearEntry);

  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [isConfirmRefreshOpen, setIsConfirmRefreshOpen] = useState(false);
  const [isConfirmCloseOpen, setIsConfirmCloseOpen] = useState(false);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const { refreshFromServer, keepLocalVersion, flushCurrentEntry, retrySync } = useEntrySync();

  const estimatedBytes = useMemo(() => estimateEncryptedBytes(document), [document]);
  const isOverLimit = estimatedBytes > MAX_ENCRYPTED_BYTES;

  const requestRefresh = () => {
    if (useWorkspaceStore.getState().isDirty) {
      setIsConfirmRefreshOpen(true);
      return;
    }
    refreshFromServer();
  };

  const handleChangeTitle = (nextTitle: string) => {
    flushCurrentEntry();
    setTitle(nextTitle);
  };

  const finishClose = () => {
    clearEntry();
    titleInputRef.current?.focus();
  };

  const handleCloseEntry = () => {
    if (!flushCurrentEntry()) {
      setIsConfirmCloseOpen(true);
      return;
    }
    finishClose();
  };

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <WorkspaceHeader
        titleInputRef={titleInputRef}
        onOpenInfo={() => setIsInfoOpen(true)}
        onRefresh={requestRefresh}
        onChangeTitle={handleChangeTitle}
        onCloseEntry={handleCloseEntry}
        isOverLimit={isOverLimit}
      />

      <main className="flex min-h-0 flex-1 flex-col">
        {title.length === 0 ? (
          <EntryEmptyState
            onGeneratePrivateTitle={() => setTitle(generatePrivateTitle())}
            onFocusTitle={() => titleInputRef.current?.focus()}
          />
        ) : (
          <EntryWorkspace
            estimatedBytes={estimatedBytes}
            onRetry={retrySync}
            onRefresh={requestRefresh}
            onKeepMine={keepLocalVersion}
          />
        )}
      </main>

      <HowItWorksDialog open={isInfoOpen} onOpenChange={setIsInfoOpen} />

      <ConfirmDialog
        open={isConfirmRefreshOpen}
        onOpenChange={setIsConfirmRefreshOpen}
        title="Replace unsaved edits?"
        description="Loading the newer version from the server will discard your unsaved changes in this entry."
        confirmLabel="Load newer version"
        tone="primary"
        onConfirm={refreshFromServer}
      />

      <ConfirmDialog
        open={isConfirmCloseOpen}
        onOpenChange={setIsConfirmCloseOpen}
        title="Discard unsaved edits?"
        description="This entry has changes that could not be saved yet. Closing now will discard them."
        confirmLabel="Discard and close"
        tone="danger"
        onConfirm={finishClose}
      />
    </div>
  );
}

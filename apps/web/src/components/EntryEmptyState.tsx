import { KeyIcon, ShuffleIcon } from '@phosphor-icons/react';
import { Button } from './ui/Button.tsx';

export function EntryEmptyState({
  onGeneratePrivateTitle,
  onFocusTitle,
}: {
  readonly onGeneratePrivateTitle: () => void;
  readonly onFocusTitle: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
      <div className="max-w-md space-y-5">
        <div className="mx-auto inline-flex size-11 items-center justify-center rounded-xl border border-border bg-surface text-accent">
          <KeyIcon className="size-5" aria-hidden="true" />
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Enter a title to open or create a note
          </h1>
          <p className="text-sm leading-relaxed text-muted">
            Your case-sensitive title encrypts the entry in your browser before anything is saved.
            Simple words are public; long passphrases stay private. There is no recovery if you
            forget it.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
          <Button variant="primary" onClick={onGeneratePrivateTitle}>
            <ShuffleIcon className="size-4" aria-hidden="true" />
            Generate private title
          </Button>
          <Button variant="secondary" onClick={onFocusTitle}>
            Type a title
          </Button>
        </div>
      </div>
    </div>
  );
}

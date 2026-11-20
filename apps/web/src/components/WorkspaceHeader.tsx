import {
  ArrowsClockwiseIcon,
  CheckCircleIcon,
  CheckIcon,
  CopyIcon,
  EyeIcon,
  EyeSlashIcon,
  InfoIcon,
  MoonIcon,
  SpinnerGapIcon,
  SunIcon,
  WarningCircleIcon,
  XIcon,
} from '@phosphor-icons/react';
import { type RefObject, useEffect, useState } from 'react';
import {
  type ResolvedScheme,
  resolveActiveScheme,
  subscribeColorScheme,
  toggleColorScheme,
} from '../lib/theme.ts';
import { useWorkspaceStore } from '../lib/workspace-store.ts';
import { BrandMark } from './BrandMark.tsx';
import { Button } from './ui/Button.tsx';
import { Input, Tooltip } from './ui/Primitives.tsx';

export function WorkspaceHeader({
  titleInputRef,
  onOpenInfo,
  onRefresh,
  onChangeTitle,
  onCloseEntry,
  isOverLimit,
}: {
  readonly titleInputRef: RefObject<HTMLInputElement | null>;
  readonly onOpenInfo: () => void;
  readonly onRefresh: () => void;
  readonly onChangeTitle: (next: string) => void;
  readonly onCloseEntry: () => void;
  readonly isOverLimit: boolean;
}) {
  const title = useWorkspaceStore(state => state.title);
  const isTitleMasked = useWorkspaceStore(state => state.isTitleMasked);
  const syncStatus = useWorkspaceStore(state => state.syncStatus);
  const isDirty = useWorkspaceStore(state => state.isDirty);
  const isServerAhead = useWorkspaceStore(state => state.isServerAhead);
  const toggleTitleMasked = useWorkspaceStore(state => state.toggleTitleMasked);

  const [scheme, setScheme] = useState<ResolvedScheme>(() => resolveActiveScheme());
  const [isTitleCopied, setIsTitleCopied] = useState(false);

  useEffect(() => subscribeColorScheme(setScheme), []);

  const handleCopyTitle = async () => {
    if (title.length === 0) return;
    try {
      await navigator.clipboard.writeText(title);
      setIsTitleCopied(true);
      setTimeout(() => setIsTitleCopied(false), 1800);
    } catch {
      // Clipboard unavailable.
    }
  };

  const statusIndicator = (() => {
    if (isServerAhead) {
      return (
        <Button
          variant="secondary"
          size="sm"
          aria-label="Refresh entry"
          onClick={onRefresh}
          className="border-warning/50 bg-warning-soft text-warning hover:bg-warning-soft"
        >
          <ArrowsClockwiseIcon className="size-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">Refresh</span>
        </Button>
      );
    }
    if (isOverLimit || syncStatus === 'error') {
      const errorLabel = isOverLimit ? 'Entry exceeds 256 KB limit' : 'Sync error';
      return (
        <Tooltip content={errorLabel}>
          <span className="inline-flex size-8 items-center justify-center text-danger">
            <WarningCircleIcon className="size-5" weight="fill" aria-label={errorLabel} />
          </span>
        </Tooltip>
      );
    }
    if (syncStatus === 'loading' || syncStatus === 'saving') {
      return (
        <span className="inline-flex items-center gap-1.5 px-1.5 text-xs text-muted">
          <SpinnerGapIcon className="size-4 animate-spin text-accent" aria-hidden="true" />
          <span className="hidden sm:inline">
            {syncStatus === 'loading' ? 'Opening…' : 'Saving…'}
          </span>
        </span>
      );
    }
    if (syncStatus === 'saved' && !isDirty && title.length > 0) {
      return (
        <Tooltip content="Encrypted and saved">
          <span className="inline-flex size-8 items-center justify-center text-success">
            <CheckCircleIcon className="size-5" weight="fill" aria-label="Encrypted and saved" />
          </span>
        </Tooltip>
      );
    }
    return null;
  })();

  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-2.5 px-3 sm:gap-4 sm:px-5">
        <button
          type="button"
          onClick={onCloseEntry}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg py-1 pr-1 text-left transition-opacity hover:opacity-85"
          aria-label="CryptNote home"
        >
          <BrandMark className="size-6 shrink-0" />
          <span className="hidden text-sm font-semibold tracking-tight text-foreground sm:inline">
            CryptNote
          </span>
        </button>

        <div className="relative flex min-w-0 flex-1 items-center">
          <Input
            ref={titleInputRef}
            type={isTitleMasked ? 'password' : 'text'}
            value={title}
            onChange={event => onChangeTitle(event.target.value)}
            placeholder="Enter case-sensitive title…"
            aria-label="Entry title (case-sensitive)"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            data-1p-ignore="true"
            data-lpignore="true"
            className="mono-exact h-9 w-full rounded-lg border border-border bg-background pl-3 pr-24 text-sm text-foreground placeholder:font-sans placeholder:text-subtle focus:border-accent focus:outline-none"
          />

          <div className="absolute right-1 flex items-center gap-0.5">
            {title.length > 0 ? (
              <>
                <Tooltip content={isTitleCopied ? 'Copied' : 'Copy title'}>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Copy entry title"
                    onClick={() => void handleCopyTitle()}
                    className="size-7"
                  >
                    {isTitleCopied ? (
                      <CheckIcon className="size-3.5 text-success" aria-hidden="true" />
                    ) : (
                      <CopyIcon className="size-3.5" aria-hidden="true" />
                    )}
                  </Button>
                </Tooltip>
                <Tooltip content="Close entry">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Close entry"
                    onClick={onCloseEntry}
                    className="size-7"
                  >
                    <XIcon className="size-3.5" aria-hidden="true" />
                  </Button>
                </Tooltip>
              </>
            ) : null}

            <Tooltip content={isTitleMasked ? 'Show title' : 'Mask title'}>
              <Button
                variant="ghost"
                size="icon"
                aria-label={isTitleMasked ? 'Show title' : 'Mask title'}
                aria-pressed={isTitleMasked}
                onClick={toggleTitleMasked}
                className="size-7"
              >
                {isTitleMasked ? (
                  <EyeSlashIcon className="size-4" aria-hidden="true" />
                ) : (
                  <EyeIcon className="size-4" aria-hidden="true" />
                )}
              </Button>
            </Tooltip>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <div className="flex items-center" role="status" aria-live="polite">
            {statusIndicator}
          </div>

          <Tooltip content={scheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}>
            <Button
              variant="ghost"
              size="icon"
              aria-label={scheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              onClick={() => setScheme(toggleColorScheme())}
            >
              {scheme === 'dark' ? (
                <SunIcon className="size-4" aria-hidden="true" />
              ) : (
                <MoonIcon className="size-4" aria-hidden="true" />
              )}
            </Button>
          </Tooltip>

          <Tooltip content="How CryptNote works">
            <Button
              variant="ghost"
              size="icon"
              aria-label="How CryptNote works"
              onClick={onOpenInfo}
            >
              <InfoIcon className="size-4" aria-hidden="true" />
            </Button>
          </Tooltip>
        </div>
      </div>
    </header>
  );
}

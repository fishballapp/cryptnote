import { type BookmarkItem, type BookmarksTab, normalizeBookmarkUrl } from '@cryptnote/crypto';
import {
  ArrowSquareOutIcon,
  CheckIcon,
  CopyIcon,
  GlobeSimpleIcon,
  PlusIcon,
  TrashIcon,
} from '@phosphor-icons/react';
import { useState } from 'react';
import { Button } from '../ui/Button.tsx';
import { FieldControl, FieldRoot, Tooltip } from '../ui/Primitives.tsx';

const hostOf = (href: string): string => {
  try {
    return new URL(href).host;
  } catch {
    return href;
  }
};

export function BookmarksTabEditor({
  tab,
  onChange,
}: {
  readonly tab: BookmarksTab;
  readonly onChange: (next: BookmarksTab) => void;
}) {
  const [urlInput, setUrlInput] = useState('');
  const [labelInput, setLabelInput] = useState('');
  const [noteInput, setNoteInput] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const updateItems = (items: readonly BookmarkItem[]) => onChange({ kind: 'bookmarks', items });

  const handleAdd = () => {
    const normalized = normalizeBookmarkUrl(urlInput);
    if (normalized === null) {
      setUrlError('Enter a valid http:// or https:// URL.');
      return;
    }
    const item: BookmarkItem = {
      id: crypto.randomUUID(),
      url: normalized,
      label: labelInput.trim() || hostOf(normalized),
      note: noteInput.trim(),
    };
    updateItems([item, ...tab.items]);
    setUrlInput('');
    setLabelInput('');
    setNoteInput('');
    setUrlError(null);
  };

  const handleCopy = async (item: BookmarkItem) => {
    try {
      await navigator.clipboard.writeText(item.url);
      setCopiedId(item.id);
      setTimeout(() => setCopiedId(current => (current === item.id ? null : current)), 1800);
    } catch {
      // Clipboard unavailable.
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <form
        onSubmit={event => {
          event.preventDefault();
          handleAdd();
        }}
        className="space-y-2 border-b border-border px-4 py-3 sm:px-6"
      >
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto]">
          <FieldRoot invalid={urlError !== null}>
            <FieldControl
              value={urlInput}
              onChange={event => {
                setUrlInput(event.target.value);
                if (urlError !== null) setUrlError(null);
              }}
              placeholder="https://example.com"
              aria-label="Bookmark URL"
              className="mono-exact h-9 w-full rounded-lg border border-border bg-background px-3 text-xs text-foreground placeholder:text-subtle focus:border-accent focus:outline-none"
            />
          </FieldRoot>
          <FieldRoot>
            <FieldControl
              value={labelInput}
              onChange={event => setLabelInput(event.target.value)}
              placeholder="Title (optional)"
              aria-label="Bookmark title"
              className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-subtle focus:border-accent focus:outline-none"
            />
          </FieldRoot>
          <Button type="submit" variant="primary" size="sm" disabled={urlInput.trim().length === 0}>
            <PlusIcon className="size-3.5" aria-hidden="true" />
            Add link
          </Button>
        </div>
        <div className="flex items-center justify-between gap-3">
          <FieldRoot className="flex-1">
            <FieldControl
              value={noteInput}
              onChange={event => setNoteInput(event.target.value)}
              placeholder="Short note (optional)"
              aria-label="Bookmark note"
              className="h-8 w-full rounded-lg border border-border/70 bg-background px-3 text-xs text-foreground placeholder:text-subtle focus:border-accent focus:outline-none"
            />
          </FieldRoot>
        </div>
        {urlError !== null ? <p className="text-xs text-danger">{urlError}</p> : null}
      </form>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-6">
        {tab.items.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">
            No bookmarks yet. Paste a URL above to save it in this encrypted entry.
          </p>
        ) : (
          <ul className="divide-y divide-border/70">
            {tab.items.map(item => {
              const safeHref = normalizeBookmarkUrl(item.url);
              const isCopied = copiedId === item.id;
              return (
                <li key={item.id} className="flex items-start justify-between gap-3 py-3">
                  <div className="flex min-w-0 items-start gap-2.5">
                    <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-sunken text-muted">
                      <GlobeSimpleIcon className="size-3.5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 space-y-0.5">
                      {safeHref !== null ? (
                        <a
                          href={safeHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex max-w-full items-center gap-1 text-sm font-medium text-foreground hover:text-accent"
                        >
                          <span className="truncate">{item.label}</span>
                          <ArrowSquareOutIcon
                            className="size-3.5 shrink-0 text-muted"
                            aria-hidden="true"
                          />
                        </a>
                      ) : (
                        <span className="block truncate text-sm font-medium text-foreground">
                          {item.label}
                        </span>
                      )}
                      <p className="mono-exact truncate text-xs text-muted">{item.url}</p>
                      {item.note.length > 0 ? (
                        <p className="text-xs text-subtle">{item.note}</p>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Tooltip content={isCopied ? 'Copied' : 'Copy URL'}>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Copy URL for ${item.label}`}
                        onClick={() => void handleCopy(item)}
                      >
                        {isCopied ? (
                          <CheckIcon className="size-3.5 text-success" aria-hidden="true" />
                        ) : (
                          <CopyIcon className="size-3.5" aria-hidden="true" />
                        )}
                      </Button>
                    </Tooltip>
                    <Tooltip content="Remove bookmark">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove ${item.label}`}
                        onClick={() => updateItems(tab.items.filter(entry => entry.id !== item.id))}
                      >
                        <TrashIcon className="size-3.5" aria-hidden="true" />
                      </Button>
                    </Tooltip>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

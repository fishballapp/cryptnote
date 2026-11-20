import type { CodeTab } from '@cryptnote/crypto';
import { CheckIcon, CopyIcon, TextAlignLeftIcon } from '@phosphor-icons/react';
import { cn } from 'cn';
import { useEffect, useRef, useState } from 'react';
import { CODE_LANGUAGE_OPTIONS } from '../../lib/tab-meta.ts';
import { Button } from '../ui/Button.tsx';
import { Select, ToggleButton } from '../ui/Primitives.tsx';

const MAX_HIGHLIGHT_CHARS = 65_536;
const LARGE_SNIPPET_DEBOUNCE_THRESHOLD = 4096;
const LARGE_SNIPPET_DEBOUNCE_MS = 60;

const supportsCustomHighlights = (): boolean =>
  typeof CSS !== 'undefined' && 'highlights' in CSS && typeof Highlight !== 'undefined';

let microlighterPromise: Promise<typeof import('microlighter')> | null = null;
const loadMicrolighter = () => {
  microlighterPromise ??= import('microlighter');
  return microlighterPromise;
};

export function CodeTabEditor({
  tab,
  onChange,
}: {
  readonly tab: CodeTab;
  readonly onChange: (next: CodeTab) => void;
}) {
  const [isWrapped, setIsWrapped] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const gutterRef = useRef<HTMLDivElement | null>(null);
  const highlightHostRef = useRef<HTMLDivElement | null>(null);
  const backdropPreRef = useRef<HTMLPreElement | null>(null);

  const isHighlighted =
    supportsCustomHighlights() &&
    tab.language !== 'plain' &&
    tab.content.length <= MAX_HIGHLIGHT_CHARS;
  const lineCount = Math.max(1, tab.content.split('\n').length);

  // Paint syntax ranges onto the single-text-node `<pre><code>` backdrop via the CSS Custom
  // Highlight API (`microlighter`), keeping zero token `<span>` nodes in the DOM.
  useEffect(() => {
    if (!supportsCustomHighlights()) return;
    const host = highlightHostRef.current;
    if (host === null) return;

    let cancelled = false;
    if (
      tab.language === 'plain' ||
      tab.content.length === 0 ||
      tab.content.length > MAX_HIGHLIGHT_CHARS
    ) {
      if (microlighterPromise === null) return;
      void microlighterPromise.then(({ highlightAll }) => {
        if (cancelled) return;
        return highlightAll({ root: document.createDocumentFragment() });
      });
      return () => {
        cancelled = true;
      };
    }

    const paint = () => {
      void loadMicrolighter()
        .then(({ highlightAll }) => {
          if (cancelled) return;
          return highlightAll({ root: host });
        })
        .catch(() => {
          // Grammar load failed; plain foreground text remains readable.
        });
    };

    if (tab.content.length > LARGE_SNIPPET_DEBOUNCE_THRESHOLD) {
      const timer = window.setTimeout(paint, LARGE_SNIPPET_DEBOUNCE_MS);
      return () => {
        cancelled = true;
        window.clearTimeout(timer);
      };
    }

    paint();
    return () => {
      cancelled = true;
    };
  }, [tab.content, tab.language]);

  // Clear highlights when the Code tab unmounts so stale ranges never linger in CSS.highlights.
  useEffect(() => {
    if (!supportsCustomHighlights()) return;
    return () => {
      if (microlighterPromise === null) return;
      void microlighterPromise.then(({ highlightAll }) => {
        const empty = document.createDocumentFragment();
        return highlightAll({ root: empty });
      });
    };
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(tab.content);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 1800);
    } catch {
      // Clipboard unavailable.
    }
  };

  // Match `<textarea>`'s trailing blank line height when content ends with a newline.
  const backdropText = tab.content.endsWith('\n') ? `${tab.content}\u200b` : tab.content;

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2 sm:px-6">
        <div className="flex items-center gap-2">
          <Select
            value={tab.language}
            onValueChange={language => onChange({ ...tab, language })}
            options={CODE_LANGUAGE_OPTIONS}
            ariaLabel="Code language"
          />
          <ToggleButton
            pressed={isWrapped}
            onPressedChange={setIsWrapped}
            ariaLabel="Toggle word wrap"
          >
            <TextAlignLeftIcon className="size-3.5" aria-hidden="true" />
            Wrap
          </ToggleButton>
        </div>

        <Button
          variant="secondary"
          size="sm"
          disabled={tab.content.length === 0}
          onClick={() => void handleCopy()}
        >
          {isCopied ? (
            <>
              <CheckIcon className="size-3.5 text-success" aria-hidden="true" />
              Copied
            </>
          ) : (
            <>
              <CopyIcon className="size-3.5" aria-hidden="true" />
              Copy
            </>
          )}
        </Button>
      </div>

      <div className="relative flex min-h-72 flex-1 overflow-hidden">
        <div
          ref={gutterRef}
          aria-hidden="true"
          className="mono-exact w-12 shrink-0 overflow-hidden border-r border-border bg-surface-sunken/70 py-4 pr-3 text-right text-xs leading-6 text-subtle select-none tabular"
        >
          {Array.from({ length: lineCount }, (_, index) => (
            <div key={index}>{index + 1}</div>
          ))}
        </div>

        <div ref={highlightHostRef} className="relative min-h-0 flex-1 overflow-hidden">
          {isHighlighted ? (
            <pre
              ref={backdropPreRef}
              aria-hidden="true"
              className={cn(
                'mono-exact pointer-events-none absolute inset-0 m-0 px-4 py-4 text-[13px] leading-6 text-foreground select-none',
                isWrapped
                  ? 'overflow-x-hidden overflow-y-auto whitespace-pre-wrap break-words'
                  : 'overflow-hidden whitespace-pre',
              )}
            >
              <code className={`language-${tab.language}`}>{backdropText}</code>
            </pre>
          ) : null}

          <textarea
            value={tab.content}
            onChange={event => onChange({ ...tab, content: event.target.value })}
            onScroll={event => {
              const { scrollTop, scrollLeft } = event.currentTarget;
              if (gutterRef.current !== null) gutterRef.current.scrollTop = scrollTop;
              if (backdropPreRef.current !== null) {
                backdropPreRef.current.scrollTop = scrollTop;
                backdropPreRef.current.scrollLeft = scrollLeft;
              }
            }}
            onKeyDown={event => {
              if (event.key !== 'Tab') return;
              event.preventDefault();
              const target = event.currentTarget;
              const start = target.selectionStart;
              const end = target.selectionEnd;
              if (event.shiftKey) {
                const lineStart = tab.content.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
                const linePrefix = tab.content.slice(lineStart, lineStart + 2);
                const removeCount = (() => {
                  if (linePrefix === '  ') return 2;
                  if (linePrefix.startsWith(' ')) return 1;
                  return 0;
                })();
                if (removeCount === 0) return;
                const next = `${tab.content.slice(0, lineStart)}${tab.content.slice(lineStart + removeCount)}`;
                onChange({ ...tab, content: next });
                requestAnimationFrame(() => {
                  target.selectionStart = Math.max(lineStart, start - removeCount);
                  target.selectionEnd = Math.max(lineStart, end - removeCount);
                });
                return;
              }
              const next = `${tab.content.slice(0, start)}  ${tab.content.slice(end)}`;
              onChange({ ...tab, content: next });
              requestAnimationFrame(() => {
                target.selectionStart = start + 2;
                target.selectionEnd = start + 2;
              });
            }}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            placeholder="// Paste or write code…"
            aria-label="Code snippet"
            className={cn(
              'mono-exact relative z-10 h-full w-full resize-none bg-transparent px-4 py-4 text-[13px] leading-6 placeholder:text-subtle focus:outline-none',
              isHighlighted ? 'text-transparent caret-foreground' : 'text-foreground',
              isWrapped
                ? 'overflow-x-hidden overflow-y-auto whitespace-pre-wrap break-words'
                : 'overflow-auto whitespace-pre',
            )}
          />
        </div>
      </div>
    </div>
  );
}

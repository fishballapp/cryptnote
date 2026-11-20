import type { NoteTab } from '@cryptnote/crypto';

export function NoteTabEditor({
  tab,
  onChange,
}: {
  readonly tab: NoteTab;
  readonly onChange: (next: NoteTab) => void;
}) {
  const trimmed = tab.content.trim();
  const wordCount = trimmed.length === 0 ? 0 : trimmed.split(/\s+/u).length;

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <textarea
        value={tab.content}
        onChange={event => onChange({ kind: 'note', content: event.target.value })}
        placeholder="Start writing…"
        aria-label="Note content"
        className="h-full min-h-72 w-full flex-1 resize-none bg-transparent px-5 py-5 text-[15px] leading-7 text-foreground placeholder:text-subtle focus:outline-none sm:px-7 sm:py-6"
      />
      {wordCount > 0 ? (
        <div className="flex items-center justify-end border-t border-border/60 px-5 py-1.5 text-xs text-subtle tabular sm:px-7">
          {wordCount} {wordCount === 1 ? 'word' : 'words'} · {tab.content.length} chars
        </div>
      ) : null}
    </div>
  );
}

import type { ChecklistItem, ChecklistTab } from '@cryptnote/crypto';
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, TrashIcon } from '@phosphor-icons/react';
import { cn } from 'cn';
import { useRef, useState } from 'react';
import { Button } from '../ui/Button.tsx';
import { Checkbox, FieldControl, FieldRoot, Input } from '../ui/Primitives.tsx';

export function ChecklistTabEditor({
  tab,
  onChange,
}: {
  readonly tab: ChecklistTab;
  readonly onChange: (next: ChecklistTab) => void;
}) {
  const [draftText, setDraftText] = useState('');
  const inputRefs = useRef(new Map<string, HTMLElement>());

  const doneCount = tab.items.filter(item => item.isChecked).length;

  const updateItems = (items: readonly ChecklistItem[]) => onChange({ kind: 'checklist', items });

  const addItem = (text: string) => {
    const clean = text.trim();
    if (clean.length === 0) return;
    const item: ChecklistItem = { id: crypto.randomUUID(), text: clean, isChecked: false };
    updateItems([...tab.items, item]);
    setDraftText('');
  };

  const insertAfter = (index: number) => {
    const item: ChecklistItem = { id: crypto.randomUUID(), text: '', isChecked: false };
    const next = [...tab.items.slice(0, index + 1), item, ...tab.items.slice(index + 1)];
    updateItems(next);
    requestAnimationFrame(() => inputRefs.current.get(item.id)?.focus());
  };

  const moveItem = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= tab.items.length) return;
    const next = [...tab.items];
    const current = next[index];
    const swapped = next[target];
    if (current === undefined || swapped === undefined) return;
    next[index] = swapped;
    next[target] = current;
    updateItems(next);
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <form
        onSubmit={event => {
          event.preventDefault();
          addItem(draftText);
        }}
        className="flex items-center gap-2 border-b border-border px-4 py-3 sm:px-6"
      >
        <FieldRoot className="flex-1">
          <FieldControl
            value={draftText}
            onChange={event => setDraftText(event.target.value)}
            placeholder="Add a checklist item…"
            aria-label="New checklist item"
            className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-subtle focus:border-accent focus:outline-none"
          />
        </FieldRoot>
        <Button type="submit" variant="primary" size="sm" disabled={draftText.trim().length === 0}>
          <PlusIcon className="size-3.5" aria-hidden="true" />
          Add
        </Button>
      </form>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-6">
        {tab.items.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">
            No items yet. Type above and press Enter to add one.
          </p>
        ) : (
          <ul className="divide-y divide-border/70">
            {tab.items.map((item, index) => (
              <li key={item.id} className="group flex items-center gap-2.5 py-2">
                <Checkbox
                  checked={item.isChecked}
                  onCheckedChange={isChecked =>
                    updateItems(
                      tab.items.map(entry =>
                        entry.id === item.id ? { ...entry, isChecked } : entry,
                      ),
                    )
                  }
                  ariaLabel={item.text.length > 0 ? `Mark "${item.text}" complete` : 'Toggle item'}
                />
                <Input
                  ref={node => {
                    if (node === null) {
                      inputRefs.current.delete(item.id);
                    } else {
                      inputRefs.current.set(item.id, node);
                    }
                  }}
                  type="text"
                  value={item.text}
                  onChange={event =>
                    updateItems(
                      tab.items.map(entry =>
                        entry.id === item.id ? { ...entry, text: event.target.value } : entry,
                      ),
                    )
                  }
                  onKeyDown={event => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      insertAfter(index);
                    } else if (event.key === 'Backspace' && item.text.length === 0) {
                      event.preventDefault();
                      const prev = tab.items[index - 1];
                      updateItems(tab.items.filter(entry => entry.id !== item.id));
                      if (prev !== undefined) {
                        requestAnimationFrame(() => inputRefs.current.get(prev.id)?.focus());
                      }
                    }
                  }}
                  aria-label={`Checklist item ${index + 1}`}
                  className={cn(
                    'min-w-0 flex-1 bg-transparent py-0.5 text-sm text-foreground focus:outline-none',
                    item.isChecked && 'text-muted line-through',
                  )}
                />
                <div className="flex items-center gap-0.5 opacity-70 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Move item up"
                    disabled={index === 0}
                    onClick={() => moveItem(index, -1)}
                  >
                    <ArrowUpIcon className="size-3.5" aria-hidden="true" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Move item down"
                    disabled={index === tab.items.length - 1}
                    onClick={() => moveItem(index, 1)}
                  >
                    <ArrowDownIcon className="size-3.5" aria-hidden="true" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Remove item"
                    onClick={() => updateItems(tab.items.filter(entry => entry.id !== item.id))}
                  >
                    <TrashIcon className="size-3.5" aria-hidden="true" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {tab.items.length > 0 ? (
        <div className="flex items-center justify-between border-t border-border/60 px-4 py-2 text-xs text-muted tabular sm:px-6">
          <span>
            {doneCount} of {tab.items.length} done
          </span>
          {doneCount > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => updateItems(tab.items.filter(item => !item.isChecked))}
            >
              Clear completed
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

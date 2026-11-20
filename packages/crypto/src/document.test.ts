import { describe, expect, it } from 'vitest';
import {
  addTab,
  availableTabKinds,
  createEmptyDocument,
  decodeDocument,
  encodeDocument,
  isDocumentEmpty,
  isTabEmpty,
  normalizeBookmarkUrl,
  removeTab,
  updateTab,
} from './document.ts';

describe('EntryDocument helpers', () => {
  it('defaults to a single empty Note tab and prevents duplicate tab kinds', () => {
    const empty = createEmptyDocument();
    expect(empty.tabs).toEqual([{ kind: 'note', content: '' }]);
    expect(isDocumentEmpty(empty)).toBe(true);

    const withChecklist = addTab(empty, 'checklist');
    expect(withChecklist.tabs.map(tab => tab.kind)).toEqual(['note', 'checklist']);
    expect(addTab(withChecklist, 'checklist')).toBe(withChecklist);
    expect(availableTabKinds(withChecklist)).toEqual(['bookmarks', 'drawing', 'code']);
  });

  it('allows removing tabs while keeping at least one tab', () => {
    const oneTab = createEmptyDocument();
    expect(removeTab(oneTab, 'note')).toBe(oneTab);

    const twoTabs = addTab(oneTab, 'code');
    const afterRemoveNote = removeTab(twoTabs, 'note');
    expect(afterRemoveNote.tabs.map(tab => tab.kind)).toEqual(['code']);
    expect(removeTab(afterRemoveNote, 'code')).toBe(afterRemoveNote);
  });

  it('round-trips every tab type through its Effect Schema JSON codec', () => {
    const full = [
      'checklist' as const,
      'bookmarks' as const,
      'drawing' as const,
      'code' as const,
    ].reduce(addTab, createEmptyDocument());

    const populated = updateTab(
      updateTab(
        updateTab(
          updateTab(updateTab(full, { kind: 'note', content: 'Hello encrypted world' }), {
            kind: 'checklist',
            items: [{ id: '1', text: 'Ship CryptNote', isChecked: true }],
          }),
          {
            kind: 'bookmarks',
            items: [{ id: 'b1', url: 'https://cryptnote.fsh.ba/', label: 'CryptNote', note: '' }],
          },
        ),
        {
          kind: 'drawing',
          elements: [
            {
              id: 'rect-1',
              type: 'rectangle',
              x: 40,
              y: 60,
              width: 180,
              height: 110,
              version: 1,
              versionNonce: 42,
              isDeleted: false,
            },
          ],
          files: {
            'file-1': {
              id: 'file-1',
              mimeType: 'image/png',
              dataURL: 'data:image/png;base64,iVBORw0KGgo=',
              created: 1_700_000_000_000,
            },
          },
        },
      ),
      { kind: 'code', language: 'typescript', content: 'export const x = 1;' },
    );

    expect(populated.tabs.every(tab => !isTabEmpty(tab))).toBe(true);
    expect(decodeDocument(encodeDocument(populated))).toEqual(populated);
  });

  it('rejects duplicate tab kinds or empty tab arrays on decode', () => {
    expect(() =>
      decodeDocument(
        JSON.stringify({
          v: 1,
          tabs: [
            { kind: 'note', content: 'a' },
            { kind: 'note', content: 'b' },
          ],
        }),
      ),
    ).toThrow(/malformed/);

    expect(() => decodeDocument(JSON.stringify({ v: 1, tabs: [] }))).toThrow(/malformed/);
  });

  it('normalizes safe bookmark URLs and rejects unsafe schemes', () => {
    expect(normalizeBookmarkUrl('example.com/path?a=1')).toBe('https://example.com/path?a=1');
    expect(normalizeBookmarkUrl('http://localhost:5184/test')).toBe('http://localhost:5184/test');
    expect(normalizeBookmarkUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeBookmarkUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(normalizeBookmarkUrl('   ')).toBeNull();
  });
});

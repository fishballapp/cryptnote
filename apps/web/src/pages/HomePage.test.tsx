import 'temporal-polyfill/global';
import { createEmptyDocument, deriveEntryKeys, sealEntry, updateTab } from '@cryptnote/crypto';
import { RegistryProvider } from '@effect/atom-react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '../components/ui/Primitives.tsx';
import { useWorkspaceStore } from '../lib/workspace-store.ts';
import { HomePage } from './HomePage.tsx';

const renderHome = () =>
  render(
    <RegistryProvider>
      <TooltipProvider>
        <HomePage />
      </TooltipProvider>
    </RegistryProvider>,
  );

const requestUrl = (input: RequestInfo | URL): string => {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
};

const defaultFetch: typeof fetch = async input => {
  const url = requestUrl(input);
  if (url.includes('/status')) {
    return new Response(JSON.stringify({ exists: false, version: null, updatedAt: null }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }
  return new Response(JSON.stringify({ entry: null }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};

describe('CryptNote workspace UI', () => {
  let activeFetch: typeof fetch = defaultFetch;

  beforeAll(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn((...args: Parameters<typeof fetch>) => activeFetch(...args)),
    );
  });

  beforeEach(() => {
    useWorkspaceStore.getState().clearEntry();
    activeFetch = defaultFetch;
  });

  afterEach(() => {
    cleanup();
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it('masks and unmasks the title input via the eye toggle without putting it in the URL', async () => {
    const user = userEvent.setup();
    renderHome();

    const titleInput = screen.getByLabelText('Entry title (case-sensitive)') as HTMLInputElement;
    await user.type(titleInput, 'MySecretTitle');
    expect(titleInput.type).toBe('text');
    expect(window.location.href).not.toContain('MySecretTitle');

    await user.click(screen.getByRole('button', { name: 'Mask title' }));
    expect(titleInput.type).toBe('password');

    await user.click(screen.getByRole('button', { name: 'Show title' }));
    expect(titleInput.type).toBe('text');
  });

  it('defaults to Note tab, adds each tab kind at most once, and edits checklist & bookmarks', async () => {
    const user = userEvent.setup();
    renderHome();

    await user.type(screen.getByLabelText('Entry title (case-sensitive)'), 'project-alpha');
    expect(screen.getByRole('tab', { name: 'Note' })).toBeTruthy();

    // Add Checklist tab.
    await user.click(screen.getByRole('button', { name: 'Add tab' }));
    await user.click(await screen.findByRole('menuitem', { name: /Checklist/i }));
    expect(screen.getByRole('tab', { name: /Checklist/i })).toBeTruthy();

    // Add an item to Checklist.
    const itemInput = screen.getByLabelText('New checklist item');
    await user.type(itemInput, 'Verify zero-knowledge crypto{Enter}');
    expect(screen.getByDisplayValue('Verify zero-knowledge crypto')).toBeTruthy();

    // Checklist should no longer appear in the Add tab menu.
    await user.click(screen.getByRole('button', { name: 'Add tab' }));
    const bookmarksItem = await screen.findByRole('menuitem', { name: /Bookmarks/i });
    expect(screen.queryByRole('menuitem', { name: /Checklist/i })).toBeNull();

    // Add Bookmarks tab and add a link.
    await user.click(bookmarksItem);
    await user.type(screen.getByLabelText('Bookmark URL'), 'cryptnote.fsh.ba');
    await user.click(screen.getByRole('button', { name: 'Add link' }));
    expect(screen.getByRole('link', { name: /cryptnote\.fsh\.ba/i })).toBeTruthy();
  });

  it('surfaces a clear client-side warning when content exceeds 256 KB encrypted', async () => {
    const user = userEvent.setup();
    renderHome();

    await user.type(screen.getByLabelText('Entry title (case-sensitive)'), 'size-check');
    useWorkspaceStore.getState().editTab({ kind: 'note', content: 'a'.repeat(210_000) });

    expect(await screen.findByText(/trim/i)).toBeTruthy();
    expect(screen.getByText(/Autosave is paused until trimmed/i)).toBeTruthy();
  });

  it('shows a refresh banner when background polling detects a newer remote version', async () => {
    const user = userEvent.setup();
    renderHome();

    await user.type(screen.getByLabelText('Entry title (case-sensitive)'), 'sync-test');
    useWorkspaceStore.getState().applySaved({
      version: 1,
      updatedAt: Date.now(),
      shouldClearDirty: true,
    });
    useWorkspaceStore.getState().markServerAhead(2);

    expect(
      await screen.findByText(/A newer encrypted version was saved from another device/i),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Load newer version' })).toBeTruthy();
  });

  it('asks for confirmation before discarding unsaved edits when clicking header Refresh', async () => {
    const user = userEvent.setup();
    renderHome();

    await user.type(screen.getByLabelText('Entry title (case-sensitive)'), 'dirty-refresh');
    useWorkspaceStore.getState().editTab({ kind: 'note', content: 'Local unsaved draft' });
    useWorkspaceStore.getState().markServerAhead(2);

    await user.click(await screen.findByRole('button', { name: 'Refresh entry' }));
    expect(await screen.findByText('Replace unsaved edits?')).toBeTruthy();
    expect(useWorkspaceStore.getState().document.tabs[0]).toEqual({
      kind: 'note',
      content: 'Local unsaved draft',
    });
  });

  it('retries an initial entry load when clicking Retry on a load error', async () => {
    const user = userEvent.setup();
    let shouldFail = true;
    activeFetch = async input => {
      const url = requestUrl(input);
      if (shouldFail && !url.includes('/status')) {
        throw new Error('Offline');
      }
      return defaultFetch(input);
    };

    renderHome();
    await user.type(screen.getByLabelText('Entry title (case-sensitive)'), 'retry-load-test');

    expect(
      await screen.findByText(
        /Could not load this entry\. Check your connection and retry\./i,
        {},
        { timeout: 5000 },
      ),
    ).toBeTruthy();
    expect(useWorkspaceStore.getState().keys).toBeNull();

    shouldFail = false;
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    await vi.waitFor(
      () => {
        expect(useWorkspaceStore.getState().keys).not.toBeNull();
        expect(useWorkspaceStore.getState().errorMessage).toBeNull();
      },
      { timeout: 5000 },
    );
  });

  it('ignores a stale load from an earlier title when the title changes during debounce', async () => {
    const user = userEvent.setup();
    const deferred: { release: (() => void) | null } = { release: null };
    const keysA = await deriveEntryKeys('title-a');
    const keysB = await deriveEntryKeys('title-b');

    activeFetch = async input => {
      const url = requestUrl(input);
      if (url.includes(keysA.entryId) && !url.includes('/status')) {
        await new Promise<void>(resolve => {
          deferred.release = resolve;
        });
      }
      return defaultFetch(input);
    };

    renderHome();
    const input = screen.getByLabelText('Entry title (case-sensitive)');
    await user.type(input, 'title-a');

    // Wait for title-a's debounced fetch to start.
    await vi.waitFor(() => expect(deferred.release).not.toBeNull(), { timeout: 5000 });

    // Switch to title-b and resolve title-a's stale fetch during title-b's debounce window.
    await user.clear(input);
    await user.type(input, 'title-b');
    deferred.release?.();

    // Title-a's keys must never attach to title-b; once title-b loads, keys must be keysB.
    await vi.waitFor(
      () => {
        expect(useWorkspaceStore.getState().keys?.entryId).toBe(keysB.entryId);
      },
      { timeout: 5000 },
    );
  });

  it('preserves local edits typed while an existing entry loads and offers Keep mine / Load newer', async () => {
    const user = userEvent.setup();
    const keys = await deriveEntryKeys('existing-entry');
    const serverDoc = updateTab(createEmptyDocument(), { kind: 'note', content: 'Server version' });
    const sealed = await sealEntry(keys, serverDoc);

    activeFetch = async input => {
      const url = requestUrl(input);
      if (url.includes(keys.entryId) && !url.includes('/status')) {
        return new Response(
          JSON.stringify({
            entry: {
              id: keys.entryId,
              ciphertext: sealed.ciphertext,
              version: 3,
              updatedAt: Date.now(),
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return defaultFetch(input);
    };

    renderHome();
    await user.type(screen.getByLabelText('Entry title (case-sensitive)'), 'existing-entry');
    // User starts typing before the debounced load completes.
    useWorkspaceStore.getState().editTab({ kind: 'note', content: 'My typed draft' });

    expect(
      await screen.findByText(
        /An existing encrypted version is already stored under this title/i,
        {},
        { timeout: 5000 },
      ),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Keep mine' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Load newer version' })).toBeTruthy();
    expect(useWorkspaceStore.getState().document.tabs[0]).toEqual({
      kind: 'note',
      content: 'My typed draft',
    });
  });

  it('prompts before closing an entry with unflushable dirty edits', async () => {
    const user = userEvent.setup();
    renderHome();

    await user.type(screen.getByLabelText('Entry title (case-sensitive)'), 'unsaved-close');
    useWorkspaceStore.getState().editTab({ kind: 'note', content: 'a'.repeat(210_000) });

    await user.click(screen.getByRole('button', { name: 'Close entry' }));
    expect(await screen.findByText('Discard unsaved edits?')).toBeTruthy();
    expect(useWorkspaceStore.getState().title).toBe('unsaved-close');

    await user.click(screen.getByRole('button', { name: 'Discard and close' }));
    expect(useWorkspaceStore.getState().title).toBe('');
  });
});

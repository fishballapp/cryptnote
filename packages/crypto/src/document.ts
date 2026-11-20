/**
 * Decrypted multi-tab entry document schema and pure immutable helpers.
 * Every entry starts with one Note tab and can include each supported tab kind at most once.
 */

import { utf8, VaultError } from '@internal/zk-vault';
import * as Schema from 'effect/Schema';
import { AES_GCM_OVERHEAD_BYTES, MAX_ENCRYPTED_BYTES } from './constants.ts';

export { AES_GCM_OVERHEAD_BYTES, MAX_ENCRYPTED_BYTES };

export const TAB_KINDS = ['note', 'checklist', 'bookmarks', 'drawing', 'code'] as const;
export type TabKind = (typeof TAB_KINDS)[number];

export const CODE_LANGUAGES = [
  'plain',
  'typescript',
  'javascript',
  'python',
  'bash',
  'json',
  'sql',
  'html',
  'css',
  'go',
  'rust',
  'markdown',
] as const;
export type CodeLanguage = (typeof CODE_LANGUAGES)[number];

export const NoteTabSchema = Schema.Struct({
  kind: Schema.Literal('note'),
  content: Schema.String,
});
export type NoteTab = typeof NoteTabSchema.Type;

export const ChecklistItemSchema = Schema.Struct({
  id: Schema.String,
  text: Schema.String,
  isChecked: Schema.Boolean,
});
export type ChecklistItem = typeof ChecklistItemSchema.Type;

export const ChecklistTabSchema = Schema.Struct({
  kind: Schema.Literal('checklist'),
  items: Schema.Array(ChecklistItemSchema),
});
export type ChecklistTab = typeof ChecklistTabSchema.Type;

export const BookmarkItemSchema = Schema.Struct({
  id: Schema.String,
  url: Schema.String,
  label: Schema.String,
  note: Schema.String,
});
export type BookmarkItem = typeof BookmarkItemSchema.Type;

export const BookmarksTabSchema = Schema.Struct({
  kind: Schema.Literal('bookmarks'),
  items: Schema.Array(BookmarkItemSchema),
});
export type BookmarksTab = typeof BookmarksTabSchema.Type;

export const ExcalidrawElementDataSchema = Schema.Record(Schema.String, Schema.Unknown);
export type ExcalidrawElementData = typeof ExcalidrawElementDataSchema.Type;

export const ExcalidrawBinaryFileSchema = Schema.Struct({
  id: Schema.String,
  mimeType: Schema.String,
  dataURL: Schema.String,
  created: Schema.Finite,
});
export type ExcalidrawBinaryFile = typeof ExcalidrawBinaryFileSchema.Type;

export const DrawingTabSchema = Schema.Struct({
  kind: Schema.Literal('drawing'),
  elements: Schema.Array(ExcalidrawElementDataSchema),
  files: Schema.optionalKey(Schema.Record(Schema.String, ExcalidrawBinaryFileSchema)),
});
export type DrawingTab = typeof DrawingTabSchema.Type;

export const CodeTabSchema = Schema.Struct({
  kind: Schema.Literal('code'),
  language: Schema.Literals(CODE_LANGUAGES),
  content: Schema.String,
});
export type CodeTab = typeof CodeTabSchema.Type;

export const EntryTabSchema = Schema.Union([
  NoteTabSchema,
  ChecklistTabSchema,
  BookmarksTabSchema,
  DrawingTabSchema,
  CodeTabSchema,
]);
export type EntryTab = typeof EntryTabSchema.Type;

export const EntryDocumentSchema = Schema.Struct({
  v: Schema.Literal(1),
  tabs: Schema.Array(EntryTabSchema).check(
    Schema.makeFilter(
      tabs => {
        if (tabs.length < 1 || tabs.length > TAB_KINDS.length) return false;
        const kinds = new Set(tabs.map(tab => tab.kind));
        return kinds.size === tabs.length;
      },
      { message: 'Entry must hold between 1 and 5 tabs, each kind appearing at most once.' },
    ),
  ),
});
export type EntryDocument = typeof EntryDocumentSchema.Type;

const EntryDocumentJsonSchema = Schema.fromJsonString(EntryDocumentSchema);
const encodeDocumentJson = Schema.encodeSync(EntryDocumentJsonSchema);
const decodeDocumentJson = Schema.decodeUnknownSync(EntryDocumentJsonSchema);

/** Creates a blank tab of the given kind. */
export const createTab = (kind: TabKind): EntryTab => {
  switch (kind) {
    case 'note':
      return { kind: 'note', content: '' };
    case 'checklist':
      return { kind: 'checklist', items: [] };
    case 'bookmarks':
      return { kind: 'bookmarks', items: [] };
    case 'drawing':
      return { kind: 'drawing', elements: [] };
    case 'code':
      return { kind: 'code', language: 'plain', content: '' };
  }
};

/** Default entry: a single empty Note tab. */
export const createEmptyDocument = (): EntryDocument => ({
  v: 1,
  tabs: [createTab('note')],
});

/** Adds a tab of `kind` if it is not already present; returns the document unchanged otherwise. */
export const addTab = (doc: EntryDocument, kind: TabKind): EntryDocument => {
  if (doc.tabs.some(tab => tab.kind === kind)) return doc;
  return { ...doc, tabs: [...doc.tabs, createTab(kind)] };
};

/** Removes the tab of `kind`, keeping at least one tab in the entry. */
export const removeTab = (doc: EntryDocument, kind: TabKind): EntryDocument => {
  if (doc.tabs.length <= 1) return doc;
  const next = doc.tabs.filter(tab => tab.kind !== kind);
  if (next.length === doc.tabs.length || next.length === 0) return doc;
  return { ...doc, tabs: next };
};

/** Replaces the matching tab kind immutably. */
export const updateTab = (doc: EntryDocument, updated: EntryTab): EntryDocument => ({
  ...doc,
  tabs: doc.tabs.map(tab => (tab.kind === updated.kind ? updated : tab)),
});

/** Returns the tab kinds not yet added to `doc`, in canonical order. */
export const availableTabKinds = (doc: EntryDocument): readonly TabKind[] => {
  const present = new Set(doc.tabs.map(tab => tab.kind));
  return TAB_KINDS.filter(kind => !present.has(kind));
};

/** Whether a tab holds no user content (used to decide whether removing it needs confirmation). */
export const isTabEmpty = (tab: EntryTab): boolean => {
  switch (tab.kind) {
    case 'note':
      return tab.content.trim().length === 0;
    case 'checklist':
      return tab.items.length === 0;
    case 'bookmarks':
      return tab.items.length === 0;
    case 'drawing':
      return tab.elements.length === 0;
    case 'code':
      return tab.content.trim().length === 0;
  }
};

/** Whether every tab in the entry is empty. */
export const isDocumentEmpty = (doc: EntryDocument): boolean => doc.tabs.every(isTabEmpty);

/** Encodes an entry document to canonical JSON string using its Effect Schema. */
export const encodeDocument = (doc: EntryDocument): string => encodeDocumentJson(doc);

/** Decodes and validates decrypted entry JSON, throwing `VaultError('malformed')` on invalid data. */
export const decodeDocument = (rawJson: string): EntryDocument => {
  try {
    return decodeDocumentJson(rawJson);
  } catch {
    throw new VaultError(
      'malformed',
      'decrypted entry does not match the CryptNote document format',
    );
  }
};

/**
 * Exact UTF-8 byte length of the base64-encoded AES-GCM ciphertext produced for `doc`.
 * Base64 length is deterministic from raw plaintext byte length: `ceil((plain + 28) / 3) * 4`.
 */
export const estimateEncryptedBytes = (doc: EntryDocument): number => {
  const plaintextBytes = utf8(encodeDocument(doc)).byteLength;
  return Math.ceil((plaintextBytes + AES_GCM_OVERHEAD_BYTES) / 3) * 4;
};

const SCHEME_PREFIX = /^[a-zA-Z][a-zA-Z0-9+.-]*:/u;

/**
 * Normalizes a user-entered bookmark URL and restricts it to `http:` or `https:`.
 * Returns `null` for empty inputs or unsafe schemes (`javascript:`, `data:`, etc.).
 */
export const normalizeBookmarkUrl = (raw: string): string | null => {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  const candidate = SCHEME_PREFIX.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    if (parsed.hostname.length === 0) return null;
    return parsed.href;
  } catch {
    return null;
  }
};

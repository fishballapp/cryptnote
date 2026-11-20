// Type facade for `@cryptnote/crypto` in Worker tests: `worker-configuration.d.ts` defines its own
// SubtleCrypto surface that clashes with `@internal/zk-vault`'s DOM types under `tsc -b`.
export { MAX_ENCRYPTED_BYTES } from '@cryptnote/crypto/constants';
export { POW_CONFIG, solvePow } from '@cryptnote/crypto/pow';

export type EntryKeys = {
  readonly entryId: string;
  readonly contentKey: unknown;
};

export type EntryTab =
  | { readonly kind: 'note'; readonly content: string }
  | {
      readonly kind: 'checklist';
      readonly items: readonly {
        readonly id: string;
        readonly text: string;
        readonly isChecked: boolean;
      }[];
    }
  | {
      readonly kind: 'bookmarks';
      readonly items: readonly {
        readonly id: string;
        readonly url: string;
        readonly label: string;
        readonly note: string;
      }[];
    }
  | {
      readonly kind: 'drawing';
      readonly elements: readonly Record<string, unknown>[];
      readonly files?: Readonly<
        Record<
          string,
          {
            readonly id: string;
            readonly mimeType: string;
            readonly dataURL: string;
            readonly created: number;
          }
        >
      >;
    }
  | { readonly kind: 'code'; readonly language: string; readonly content: string };

export type EntryDocument = {
  readonly v: 1;
  readonly tabs: readonly EntryTab[];
};

export declare function createEmptyDocument(): EntryDocument;
export declare function addTab(doc: EntryDocument, kind: EntryTab['kind']): EntryDocument;
export declare function updateTab(doc: EntryDocument, tab: EntryTab): EntryDocument;
export declare function deriveEntryKeys(title: string): Promise<EntryKeys>;
export declare function sealEntry(
  keys: EntryKeys,
  document: EntryDocument,
): Promise<{ readonly id: string; readonly ciphertext: string; readonly encryptedBytes: number }>;
export declare function openEntry(keys: EntryKeys, ciphertext: string): Promise<EntryDocument>;

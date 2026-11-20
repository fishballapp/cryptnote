/**
 * Client-side zero-knowledge encryption for CryptNote, built on `@internal/zk-vault` primitives
 * (WebCrypto only).
 *
 * ```
 * seed       = PBKDF2-HMAC-SHA256(utf8(title), salt = "cryptnote-v1-kdf", 100_000)
 * entryId    = base64url(HKDF(seed, info = "cryptnote-v1-id"))          -> opaque server key (43 chars)
 * contentKey = HKDF(seed, info = "cryptnote-v1-content") -> AES-256-GCM -> never leaves the browser
 * ciphertext = base64(iv || AES-GCM(contentKey, iv, json, aad = ["cryptnote-v1", entryId]))
 * ```
 *
 * Titles are case-sensitive UTF-8 strings with no trimming or Unicode normalization. The server
 * receives only `entryId` and `ciphertext`; AAD binds ciphertext to `entryId` and format version.
 */

import {
  freshIv,
  fromUtf8,
  hkdf,
  hkdfBytes,
  sealed,
  toBase64Url,
  unseal,
  utf8,
  VaultError,
} from '@internal/zk-vault';
import {
  decodeDocument,
  type EntryDocument,
  encodeDocument,
  MAX_ENCRYPTED_BYTES,
} from './document.ts';

const KDF_SALT = utf8('cryptnote-v1-kdf');
const KDF_ITERATIONS = 100_000;
const ID_INFO = 'cryptnote-v1-id';
const CONTENT_INFO = 'cryptnote-v1-content';
const ENVELOPE_VERSION = 'cryptnote-v1';

export type EntryKeys = {
  /** Opaque 43-char unpadded base64url identifier derived one-way from the title. */
  readonly entryId: string;
  /** Non-extractable AES-256-GCM key used strictly inside the browser. */
  readonly contentKey: CryptoKey;
};

export type SealedEntry = {
  readonly id: string;
  readonly ciphertext: string;
  readonly encryptedBytes: number;
};

const entryAad = (entryId: string): Uint8Array<ArrayBuffer> =>
  utf8(JSON.stringify([ENVELOPE_VERSION, entryId]));

const pbkdf2Seed = async (title: string): Promise<Uint8Array<ArrayBuffer>> => {
  const raw = await crypto.subtle.importKey('raw', utf8(title), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: KDF_SALT, iterations: KDF_ITERATIONS },
    raw,
    256,
  );
  return new Uint8Array(bits);
};

/** Derives the opaque server lookup ID and the local AES-256-GCM content key from a title. */
export const deriveEntryKeys = async (title: string): Promise<EntryKeys> => {
  if (title.length === 0) {
    throw new VaultError('malformed', 'entry title must not be empty');
  }
  const seed = await pbkdf2Seed(title);
  const [idBytes, contentKey] = await Promise.all([
    hkdfBytes(seed, ID_INFO),
    hkdf(seed, CONTENT_INFO, { name: 'AES-GCM', length: 256 }, ['encrypt', 'decrypt']),
  ]);
  return {
    entryId: toBase64Url(idBytes),
    contentKey,
  };
};

/** Encrypts and authenticates an entry document, enforcing the 256 KiB encrypted payload cap. */
export const sealEntry = async (keys: EntryKeys, document: EntryDocument): Promise<SealedEntry> => {
  const plaintext = utf8(encodeDocument(document));
  const iv = freshIv();
  const body = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: entryAad(keys.entryId) },
      keys.contentKey,
      plaintext,
    ),
  );
  const ciphertext = sealed(iv, body);
  const encryptedBytes = utf8(ciphertext).byteLength;
  if (encryptedBytes > MAX_ENCRYPTED_BYTES) {
    throw new VaultError(
      'malformed',
      `encrypted entry is ${encryptedBytes} bytes, exceeding the ${MAX_ENCRYPTED_BYTES}-byte limit`,
    );
  }
  return { id: keys.entryId, ciphertext, encryptedBytes };
};

/** Authenticates, decrypts, and validates a stored entry ciphertext. */
export const openEntry = async (keys: EntryKeys, ciphertext: string): Promise<EntryDocument> => {
  const { iv, body } = unseal(ciphertext, `entry ${keys.entryId}`);
  const opened = await crypto.subtle
    .decrypt({ name: 'AES-GCM', iv, additionalData: entryAad(keys.entryId) }, keys.contentKey, body)
    .catch(() => {
      throw new VaultError('unreadable', `entry ${keys.entryId} did not authenticate`);
    });
  return decodeDocument(fromUtf8(new Uint8Array(opened)));
};

const WORDLIST = [
  'acorn',
  'alder',
  'amber',
  'anvil',
  'aspen',
  'atlas',
  'badge',
  'basil',
  'birch',
  'bloom',
  'bough',
  'brine',
  'brook',
  'cairn',
  'cedar',
  'chalk',
  'cider',
  'cliff',
  'cloud',
  'clover',
  'cobalt',
  'coral',
  'crane',
  'creek',
  'crest',
  'crown',
  'cypress',
  'delta',
  'drift',
  'dunes',
  'ember',
  'fable',
  'falcon',
  'ferns',
  'fjord',
  'flint',
  'flora',
  'forge',
  'frost',
  'garnet',
  'glade',
  'gleam',
  'grain',
  'grove',
  'harbor',
  'hazel',
  'heath',
  'heron',
  'hollow',
  'ivory',
  'jasper',
  'juniper',
  'kelp',
  'kestrel',
  'knoll',
  'larch',
  'laurel',
  'ledge',
  'lichen',
  'linen',
  'lotus',
  'lunar',
  'maple',
  'marsh',
  'meadow',
  'mica',
  'mirth',
  'misty',
  'mossy',
  'nacre',
  'nectar',
  'north',
  'oakum',
  'ochre',
  'olive',
  'onyx',
  'orbit',
  'osprey',
  'otter',
  'pebble',
  'petal',
  'piney',
  'plume',
  'poplar',
  'prism',
  'pulse',
  'quartz',
  'quill',
  'raven',
  'reeds',
  'ridge',
  'river',
  'robin',
  'rowan',
  'sable',
  'saffron',
  'sage',
  'salix',
  'sands',
  'shale',
  'shell',
  'shore',
  'silt',
  'slate',
  'solar',
  'sorrel',
  'spark',
  'spruce',
  'starry',
  'stone',
  'storm',
  'swift',
  'taper',
  'thistle',
  'thorn',
  'tidal',
  'timber',
  'topaz',
  'trail',
  'tulip',
  'umber',
  'vale',
  'vapor',
  'velvet',
  'verge',
  'willow',
  'wren',
  'zephyr',
] as const;

const CROCKFORD_BASE32 = '0123456789abcdefghjkmnpqrstvwxyz';

/**
 * Generates an unguessable private entry title with 85 bits of unbiased CSPRNG entropy:
 * 5 words from the 128-word list (35 bits) plus 10 Crockford base32 characters (50 bits).
 */
export const generatePrivateTitle = (): string => {
  const random = crypto.getRandomValues(new Uint8Array(15));
  const words = [0, 1, 2, 3, 4].map(index => {
    const word = WORDLIST[(random[index] ?? 0) & 0x7f];
    if (word === undefined) throw new Error('WORDLIST index out of range');
    return word;
  });
  const suffixChars = Array.from({ length: 10 }, (_, index) => {
    const ch = CROCKFORD_BASE32[(random[5 + index] ?? 0) & 0x1f];
    if (ch === undefined) throw new Error('Base32 alphabet index out of range');
    return ch;
  }).join('');
  return `${words.join('-')}-${suffixChars.slice(0, 5)}-${suffixChars.slice(5)}`;
};

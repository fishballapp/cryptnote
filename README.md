# CryptNote

Zero-knowledge, no-account encrypted notepad at [cryptnote.fsh.ba](https://cryptnote.fsh.ba).

Enter any case-sensitive title to open an existing entry or start a new one. Every entry is
encrypted in your browser before anything is sent to the server, autosaves automatically, and
supports multiple tabs (**Note**, **Checklist**, **Bookmarks**, **Drawing**, and **Code**) inside
a single encrypted payload.

## How it works

- **No accounts, no recovery.** Your case-sensitive title is the sole key material. It never leaves
  your browser and never appears in the URL.
- **Client-side encryption.** Your browser stretches the title with PBKDF2-HMAC-SHA256 (100,000
  iterations) and derives two independent HKDF-SHA256 outputs: an opaque 43-character lookup ID sent
  to the server, and a non-extractable AES-256-GCM key that encrypts the entry locally with a fresh
  96-bit random IV on every save.
- **Multi-tab entries.** Every entry opens with a **Note** tab and can include up to one each of
  **Note**, **Checklist**, **Bookmarks**, **Drawing**, and **Code**, with an optional side-by-side
  split pane on wide screens.
- **Background sync polling.** While an entry is open, lightweight version polling detects saves
  from other devices so you can refresh without blindly overwriting.
- **Abuse protection without CAPTCHAs.** Every entry is capped at 256 KiB of encrypted ciphertext.
  Saves are protected by adaptive SHA-256 Proof-of-Work solved off the main thread in a Web Worker,
  plus per-IP and per-entry rate limits.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the cryptographic schedule, wire format, and Worker
topology.

## Public vs. private titles

- A short or common title behaves like a shared public notepad anyone who types it can read or edit.
- A long, random passphrase keeps an entry private. Use **Generate private title** in the app for a
  random multi-word key.

## Development

Requirements: Node >= 26, pnpm 12.

```sh
pnpm install
pnpm -F @cryptnote/worker-web dev   # local Cloudflare Worker + D1 on :8792
pnpm -F @cryptnote/web dev          # Vite SPA on :5184, proxying /api to :8792
```

Ports can be overridden with `CRYPTNOTE_WEB_PORT`, `CRYPTNOTE_WORKER_PORT`, and
`CRYPTNOTE_WORKER_INSPECTOR_PORT`.

## Verification

```sh
pnpm check          # Biome lint + format
pnpm check:effect   # Effect language-service diagnostics
pnpm typecheck      # TypeScript project-reference build
pnpm test           # Unit, Worker/D1, and React UI tests
pnpm build          # Production SPA + Worker asset assembly
```

## License

MIT — see [LICENSE](LICENSE).

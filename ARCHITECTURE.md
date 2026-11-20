# CryptNote Architecture

## Overview

CryptNote runs on a single Cloudflare Worker (`cryptnote-web`) backed by one D1 database
(`cryptnote`) and four Workers Rate Limiting bindings (`READ_LIMIT`, `WRITE_LIMIT`,
`CHALLENGE_LIMIT`, `CREATE_LIMIT`).

- Static SPA assets (`apps/web/dist`) are served directly by Cloudflare Workers Static Assets with
  `not_found_handling: "single-page-application"` and `run_worker_first: ["/api/*"]`.
- Only `/api/*` requests invoke the Worker, so static page loads incur zero Worker invocations and
  the SPA and API share one origin (no CORS needed).
- A strict Content Security Policy (`script-src 'self'`, `Referrer-Policy: no-referrer`) is served
  from `apps/worker-web/_headers`. Theme pre-paint bootstrapping runs from `/theme-init.js`.

## Package Graph

| Package | Responsibility |
| --- | --- |
| `packages/crypto` (`@cryptnote/crypto`) | Pure WebCrypto key derivation, AES-256-GCM seal/open on `@internal/zk-vault`, multi-tab Effect Schema codecs, synchronous SHA-256 + WebCrypto PoW primitives. |
| `packages/api` (`@cryptnote/api`) | Effect v4 `HttpApi` definition (`CryptNoteApi`), wire schemas, error contracts, and OpenAPI metadata. Zero server dependencies. |
| `apps/worker-web` (`@cryptnote/worker-web`) | Effect `HttpApiBuilder` implementation over `@effect/sql-d1`, adaptive PoW challenge store, per-IP and per-entry rate limits, hourly cleanup cron, and static asset assembly. |
| `apps/web` (`@cryptnote/web`) | Vite + React 19 + TanStack Router + Base UI + Tailwind v4 + Effect atoms SPA with off-thread Web Worker PoW solver. |

## Cryptographic Schedule (`packages/crypto`)

All cryptographic operations use WebCrypto (`crypto.subtle` and `crypto.getRandomValues`) via
`@internal/zk-vault`. Titles are exact, case-sensitive UTF-8 strings with no trimming or Unicode
normalization.

```text
titleBytes = utf8(title)
seed       = PBKDF2-HMAC-SHA256(titleBytes, salt = utf8("cryptnote-v1-kdf"), iterations = 100_000, 256 bits)
entryId    = base64url(HKDF-SHA256(seed, info = "cryptnote-v1-id"))          // 43 chars -> server lookup key
contentKey = HKDF-SHA256(seed, info = "cryptnote-v1-content")                // AES-256-GCM, non-extractable
iv         = random(96 bits)                                                 // fresh on every save
aad        = utf8(JSON.stringify(["cryptnote-v1", entryId]))
ciphertext = base64(iv || AES-256-GCM(contentKey, iv, utf8(documentJson), aad))
```

Properties:
- **Domain separation:** Knowing `entryId` reveals nothing about `contentKey`.
- **Substitution resistance:** Binding `["cryptnote-v1", entryId]` as AES-GCM AAD prevents the
  server from substituting ciphertext stored under one ID into another.
- **No title exposure:** The title never leaves browser memory and never appears in request URLs,
  query strings, or browser history.

## Multi-Tab Document Format

The decrypted JSON payload conforms to `EntryDocumentSchema` (`v: 1`):

- `tabs`: array of 1 to 5 unique tab objects (`note`, `checklist`, `bookmarks`, `drawing`, `code`).
- Default entry: `{ "v": 1, "tabs": [{ "kind": "note", "content": "" }] }`.
- The Drawing tab embeds a lazy-loaded Excalidraw whiteboard (`@excalidraw/excalidraw`) with
  self-hosted fonts under `/excalidraw-assets/fonts/` (zero external CDN requests under strict CSP),
  storing non-deleted scene `elements` and referenced embedded `files` inside the encrypted envelope.
- The Code tab highlights snippets via lazy-loaded `microlighter` (on-demand TextMate ES grammars +
  the browser-native CSS Custom Highlight API, zero token `<span>` nodes or WASM) behind a native
  `<textarea>` so native undo, IME, and accessibility stay intact.
- Bookmark URLs are restricted strictly to `http:` and `https:` schemes.

## Size Cap, Adaptive Proof-of-Work & Rate Limits

- **256 KiB cap (`262_144` bytes):** Enforced both client-side (deterministic size calculation from
  plaintext UTF-8 bytes before encryption, pausing autosave with an explicit trim message) and
  server-side (in `WriteAbuseGuard`, which requires a valid numeric `Content-Length` header within
  the 256 KiB + 4 KiB envelope cap, and in `Notes.save` on the ciphertext byte length, returning
  `413 PayloadTooLargeError`).
- **Optimistic concurrency (`expectedVersion`):** Every `PUT /api/v1/notes/:id` carries the server
  version the client loaded (`null` when creating a brand-new entry). The Worker applies an atomic
  conditional `INSERT ... ON CONFLICT DO NOTHING` or `UPDATE ... WHERE version = expectedVersion`,
  returning `409 ConflictError` with `{ currentVersion, updatedAt }` if another device saved first
  so autosave never silently overwrites newer edits.
- **Adaptive Proof-of-Work:**
  - `POST /api/v1/challenge` counts accepted writes in `write_event` over the past 60 seconds and
    issues a 128-bit random hex nonce stored in D1 (`pow_challenge`, 30-second TTL) with a target
    leading-zero-bit difficulty: 10 bits (< 15 writes/min), 14 bits (15-59), 17 bits (60-249), or
    20 bits (>= 250).
  - The browser solves `SHA-256(nonce + ":" + proof)` in a dedicated Web Worker (`pow-worker.ts`).
  - `PUT /api/v1/notes/:id` atomically consumes the nonce with `DELETE ... RETURNING` so every
    challenge is strictly single-use across isolates, verifies TTL and proof via WebCrypto SHA-256,
    and conditionally inserts/updates the ciphertext while incrementing `version`.
- **Rate limiting & D1 storage abuse protection:**
  - Per-IP edge limits via Cloudflare Workers Rate Limiting (`READ_LIMIT` 180/min, `WRITE_LIMIT`
    60/min, `CHALLENGE_LIMIT` 90/min, `CREATE_LIMIT` 10 new entries/min; IPv6 normalized to `/64`).
  - Daily per-IP new-entry byte cap in D1 (`5 MiB/day`, stored in `daily_create_quota` under
    `day_bucket` + `SHA-256(day_bucket:clientKey)` so no raw IP address is persisted).
  - Per-entry sliding-window write limit in D1 (`30` writes per 60 seconds per `entry_id`).
- **Cleanup cron:** Hourly schedule (`17 * * * *`) removes expired challenges, `write_event` rows
  older than 5 minutes, and `daily_create_quota` rows older than 2 UTC days.

## HTTP Endpoints

- `GET /api/health` — liveness probe (`{ name: "cryptnote", status: "ok" }`).
- `GET /api/v1/notes/:id` — returns `{ entry: { id, ciphertext, version, updatedAt } | null }`.
- `GET /api/v1/notes/:id/status` — lightweight polling check returning `{ exists, version, updatedAt }`.
- `POST /api/v1/challenge` — issues `{ nonce, difficulty, expiresAt }`.
- `PUT /api/v1/notes/:id` — verifies PoW + caps + rate limits, stores ciphertext, returns `{ id, version, updatedAt, encryptedBytes }`.

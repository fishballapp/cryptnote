-- Encrypted zero-knowledge entries. The server stores only the opaque client-derived ID and
-- authenticated AES-256-GCM ciphertext.
CREATE TABLE entry (
  id              TEXT PRIMARY KEY,
  ciphertext      TEXT NOT NULL,
  encrypted_bytes INTEGER NOT NULL,
  version         INTEGER NOT NULL DEFAULT 1,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

-- One-time adaptive Proof-of-Work challenges, consumed atomically via DELETE ... RETURNING.
CREATE TABLE pow_challenge (
  nonce       TEXT PRIMARY KEY,
  difficulty  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_pow_challenge_expires_at ON pow_challenge (expires_at);

-- Sliding window of accepted writes for adaptive PoW difficulty and per-entry rate limiting.
CREATE TABLE write_event (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id    TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_write_event_created_at ON write_event (created_at);
CREATE INDEX idx_write_event_entry_created ON write_event (entry_id, created_at);

-- Daily per-IP byte cap for brand-new entries. Keyed by UTC day + SHA-256(day || clientKey) so raw
-- IPs are never stored in D1 and entries from different days are unlinkable; swept after 2 days.
CREATE TABLE daily_create_quota (
  day_bucket  INTEGER NOT NULL,
  client_hash TEXT NOT NULL,
  bytes_used  INTEGER NOT NULL,
  PRIMARY KEY (day_bucket, client_hash)
);

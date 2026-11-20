/** Hard ceiling for the base64-encoded AES-GCM payload (256 KiB), enforced client- and server-side. */
export const MAX_ENCRYPTED_BYTES = 256 * 1024;

/** 12-byte random IV + 16-byte AES-GCM authentication tag. */
export const AES_GCM_OVERHEAD_BYTES = 28;

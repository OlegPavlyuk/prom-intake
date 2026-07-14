// Token minting and hashing for the Access link (ADR-0005). The raw token is a
// high-entropy secret handed to the coordinator exactly once; only its SHA-256
// hash is ever persisted, so a datastore leak yields no working link. Validation
// hashes the presented token and looks the record up by that hash.

import { createHash, randomBytes } from "node:crypto";

/** 256 bits of entropy, URL-safe (base64url, no padding). */
const TOKEN_BYTES = 32;

/** Mint a fresh token and its storage hash. The raw token is never stored. */
export function mintToken(): { readonly token: string; readonly hash: string } {
  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  return { token, hash: hashToken(token) };
}

/** The stored hash of a raw token (SHA-256, hex). */
export function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

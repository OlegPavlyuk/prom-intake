// Token minting and hashing for the Access link (ADR-0005). The raw token is a
// high-entropy secret handed to the coordinator exactly once; only its SHA-256
// hash is ever persisted, so a datastore leak yields no working link. Validation
// hashes the presented token and looks the record up by that hash.
//
// Implemented on the Web Crypto API (`globalThis.crypto`) so the module is
// isomorphic (ADR-0010): the Coordinator app mints tokens in the browser under
// the coordinator's own session, while the submit Bot and integration tests run
// the same code in Node. Both Node (>=20) and browsers provide `crypto.subtle`
// and `crypto.getRandomValues`; hashing is therefore async.

/** 256 bits of entropy, URL-safe (base64url, no padding). */
const TOKEN_BYTES = 32;

/** Mint a fresh token and its storage hash. The raw token is never stored. */
export async function mintToken(): Promise<{
  readonly token: string;
  readonly hash: string;
}> {
  const bytes = new Uint8Array(TOKEN_BYTES);
  globalThis.crypto.getRandomValues(bytes);
  const token = base64url(bytes);
  return { token, hash: await hashToken(token) };
}

/** The stored hash of a raw token (SHA-256, hex). */
export async function hashToken(rawToken: string): Promise<string> {
  const data = new TextEncoder().encode(rawToken);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", data);
  return hex(new Uint8Array(digest));
}

/** Base64url-encode bytes (URL-safe, unpadded) without Node's Buffer. */
function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return globalThis
    .btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Lowercase-hex-encode bytes without Node's Buffer. */
function hex(bytes: Uint8Array): string {
  let out = "";
  for (const byte of bytes) {
    out += byte.toString(16).padStart(2, "0");
  }
  return out;
}

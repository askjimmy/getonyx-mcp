/**
 * Encryption utilities for the wallet keystore.
 *
 * Uses Node's built-in Web Crypto API (`crypto.subtle`) — no external
 * crypto dependency required.
 *
 * - KDF: PBKDF2-SHA256, 100,000 iterations, 32-byte output (AES-256 key)
 * - Cipher: AES-256-GCM
 *
 * Wire format of an encrypted private key (base64-encoded):
 *   [salt (16 bytes)] [iv (12 bytes)] [ciphertext + GCM tag (N bytes)]
 */

const SALT_LENGTH = 16; // bytes
const IV_LENGTH = 12; // bytes — standard for AES-GCM
const PBKDF2_ITERATIONS = 100_000;
const KEY_LENGTH = 256; // bits — AES-256

export interface EncryptedPayload {
  /** base64-encoded [salt][iv][ciphertext+tag] */
  encrypted: string;
}

/**
 * Derive a 256-bit AES key from a password and salt using PBKDF2-SHA256.
 */
async function deriveKey(password: string, salt: Uint8Array) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Encrypt a plaintext (e.g. private key bytes) with a password.
 *
 * Returns a base64-encoded payload of [salt][iv][ciphertext+tag].
 */
export async function encryptWithPassword(
  plaintext: string,
  password: string,
): Promise<EncryptedPayload> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const key = await deriveKey(password, salt);

  const enc = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(plaintext),
  );

  // Concatenate salt + iv + ciphertext into a single buffer.
  const payload = new Uint8Array(
    salt.length + iv.length + ciphertext.byteLength,
  );
  payload.set(salt, 0);
  payload.set(iv, salt.length);
  payload.set(new Uint8Array(ciphertext), salt.length + iv.length);

  return { encrypted: Buffer.from(payload).toString('base64') };
}

/**
 * Decrypt an encrypted payload produced by `encryptWithPassword`.
 *
 * Throws if the password is incorrect (AES-GCM tag mismatch).
 */
export async function decryptWithPassword(
  payload: EncryptedPayload,
  password: string,
): Promise<string> {
  const raw = Buffer.from(payload.encrypted, 'base64');
  if (raw.length < SALT_LENGTH + IV_LENGTH + 1) {
    throw new Error('Invalid encrypted payload: too short');
  }

  const salt = raw.subarray(0, SALT_LENGTH);
  const iv = raw.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const ciphertext = raw.subarray(SALT_LENGTH + IV_LENGTH);

  const key = await deriveKey(password, salt);
  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext,
    );
  } catch {
    // AES-GCM tag mismatch: wrong password or tampered payload.
    throw new Error('Invalid password or corrupted keystore entry');
  }

  return new TextDecoder().decode(plaintext);
}
/**
 * Dynamic session storage for the Ambient (online) wallet.
 *
 * A session holds everything needed to sign on behalf of the user:
 *   - `jwt`              the Dynamic user JWT (bearer credential)
 *   - `walletMetadata`   the Ambient wallet identity + key-share backup info
 *   - `privateKeyJwk`    the P-256 session key that binds the JWT
 *
 * The file lives at `DYNAMIC_SESSION_PATH` (default
 * `~/.config/wallet-mcp-server/dynamic-session.json`).
 *
 * The session file is encrypted at rest with the same PBKDF2/AES-256-GCM
 * scheme used by the keystore whenever `DYNAMIC_SESSION_PASSWORD` (or
 * `WALLET_PASSWORD`) is configured. Without it the file is written as
 * plaintext with 0600 permissions and a warning is printed to stderr.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { JsonWebKey } from 'node:crypto';
import { encryptWithPassword, decryptWithPassword } from '../keystore/crypto.js';
import { getSessionPassword } from './config.js';

/**
 * The wallet metadata Dynamic requires for signing. It mirrors the SDK's
 * `WalletMetadata` shape and must be persisted as returned by
 * `createWalletAccount` — in particular it carries
 * `externalServerKeySharesBackupInfo`, without which signing cannot recover
 * the server key share.
 */
export interface DynamicWalletMetadata {
  walletId: string;
  accountAddress: string;
  chainName: string;
  thresholdSignatureScheme: string;
  derivationPath?: string;
  addressType?: string;
  externalServerKeySharesBackupInfo?: Record<string, any>;
  shareSetId?: string;
  shareSetType?: string;
  otherShareSets?: any[];
  [key: string]: any;
}

export interface DynamicSession {
  jwt: string;
  walletMetadata: DynamicWalletMetadata;
  /** This server's key share for the Ambient wallet, when it was created here. */
  externalServerKeyShares?: any[];
  /** P-256 session key (JWK) that binds the JWT — a leaked JWT alone cannot sign. */
  privateKeyJwk: JsonWebKey;
  /** Compressed P-256 public key hex bound into the JWT. */
  publicKeyHex: string;
  email?: string;
  createdAt: string;
  /** JWT expiry, when Dynamic reports one. */
  expiresAt?: string;
  environmentId: string;
}

interface EncryptedSessionFile {
  version: 1;
  encrypted: string;
}

interface PlainSessionFile {
  version: 1;
  session: DynamicSession;
}

type SessionFile = EncryptedSessionFile | PlainSessionFile;

let warnedAboutPlaintext = false;

export function getSessionPath(): string {
  const envPath = process.env.DYNAMIC_SESSION_PATH;
  if (envPath) return envPath;
  return path.join(os.homedir(), '.config', 'wallet-mcp-server', 'dynamic-session.json');
}

export async function loadSession(): Promise<DynamicSession | null> {
  const p = getSessionPath();
  let raw: string;
  try {
    raw = await fs.promises.readFile(p, 'utf-8');
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return null;
    }
    throw err;
  }

  let parsed: SessionFile;
  try {
    parsed = JSON.parse(raw) as SessionFile;
  } catch {
    throw new Error(`Dynamic session file is corrupted: ${p}`);
  }

  if ('encrypted' in parsed) {
    const password = getSessionPassword();
    if (!password) {
      throw new Error(
        'Dynamic session is encrypted but no DYNAMIC_SESSION_PASSWORD (or WALLET_PASSWORD) is set. ' +
          'Set it to the value used when the session was created, or delete the session file to sign in again.',
      );
    }
    const plaintext = await decryptWithPassword({ encrypted: parsed.encrypted }, password);
    return JSON.parse(plaintext) as DynamicSession;
  }

  return parsed.session;
}

export async function saveSession(session: DynamicSession): Promise<void> {
  const p = getSessionPath();
  await fs.promises.mkdir(path.dirname(p), { recursive: true });

  const password = getSessionPassword();
  let contents: string;
  if (password) {
    const { encrypted } = await encryptWithPassword(JSON.stringify(session), password);
    contents = JSON.stringify({ version: 1, encrypted } satisfies EncryptedSessionFile, null, 2);
  } else {
    if (!warnedAboutPlaintext) {
      warnedAboutPlaintext = true;
      console.error(
        '[wallet-mcp-server] WARNING: DYNAMIC_SESSION_PASSWORD is not set — the Dynamic session ' +
          '(JWT + session key) is stored in plaintext. Set DYNAMIC_SESSION_PASSWORD to encrypt it.',
      );
    }
    contents = JSON.stringify({ version: 1, session } satisfies PlainSessionFile, null, 2);
  }

  const tmp = p + '.tmp';
  await fs.promises.writeFile(tmp, contents, { encoding: 'utf-8', mode: 0o600 });
  await fs.promises.rename(tmp, p);
  await fs.promises.chmod(p, 0o600);
}

export async function clearSession(): Promise<void> {
  const p = getSessionPath();
  try {
    await fs.promises.unlink(p);
  } catch (err: any) {
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }
}

/**
 * Load the session, throwing a clear error when the user is not signed in.
 */
export async function requireSession(): Promise<DynamicSession> {
  const session = await loadSession();
  if (!session) {
    throw new Error(
      'No Dynamic session. Call wallet_sign_in_email then wallet_verify_email to connect the Ambient wallet.',
    );
  }
  if (session.expiresAt && Date.parse(session.expiresAt) <= Date.now()) {
    throw new Error('Dynamic session expired. Call wallet_sign_in_email then wallet_verify_email again.');
  }
  return session;
}

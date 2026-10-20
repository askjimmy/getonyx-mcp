/**
 * Encrypted file-based keystore manager.
 *
 * Stores wallet entries in a JSON file at `WALLET_KEYSTORE_PATH` (default
 * `~/.config/wallet-mcp-server/keystore.json`). Private keys are encrypted
 * at rest with AES-256-GCM (PBKDF2-derived key). Passwords are never stored.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { randomUUID } from 'node:crypto';
import { encryptWithPassword, decryptWithPassword } from './crypto.js';
import { KeyStore, WalletEntry, ChainId } from './types.js';

export function getKeystorePath(): string {
  const envPath = process.env.WALLET_KEYSTORE_PATH;
  if (envPath) return envPath;
  return path.join(os.homedir(), '.config', 'wallet-mcp-server', 'keystore.json');
}

async function loadRaw(): Promise<KeyStore> {
  const p = getKeystorePath();
  try {
    const raw = await fs.promises.readFile(p, 'utf-8');
    const parsed = JSON.parse(raw) as KeyStore;
    if (!parsed.version || !parsed.wallets) {
      throw new Error('Invalid keystore format');
    }
    return parsed;
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return { version: 1, wallets: {} };
    }
    throw err;
  }
}

async function saveRaw(keystore: KeyStore): Promise<void> {
  const p = getKeystorePath();
  await fs.promises.mkdir(path.dirname(p), { recursive: true });
  const tmp = p + '.tmp';
  await fs.promises.writeFile(tmp, JSON.stringify(keystore, null, 2), 'utf-8');
  await fs.promises.rename(tmp, p);
}

export async function loadKeystore(): Promise<KeyStore> {
  return loadRaw();
}

export async function saveKeystore(keystore: KeyStore): Promise<void> {
  return saveRaw(keystore);
}

export async function generateWallet(
  chainId: ChainId,
  password: string,
  label?: string,
): Promise<WalletEntry> {
  const { getChainWallet } = await import('../chains/index.js');
  const wallet = getChainWallet(chainId);
  const { privateKey, address } = await wallet.generate();
  const { encrypted } = await encryptWithPassword(privateKey, password);

  const entry: WalletEntry = {
    id: randomUUID(),
    chain: chainId,
    address,
    encryptedPrivateKey: encrypted,
    createdAt: new Date().toISOString(),
    metadata: label ? { label } : undefined,
  };

  const keystore = await loadRaw();
  keystore.wallets[entry.id] = entry;
  await saveRaw(keystore);
  return entry;
}

export async function importWallet(
  chainId: ChainId,
  privateKey: string,
  password: string,
  label?: string,
): Promise<WalletEntry> {
  const { getChainWallet } = await import('../chains/index.js');
  const wallet = getChainWallet(chainId);
  const address = await wallet.getAddress(privateKey);
  const { encrypted } = await encryptWithPassword(privateKey, password);

  const entry: WalletEntry = {
    id: randomUUID(),
    chain: chainId,
    address,
    encryptedPrivateKey: encrypted,
    createdAt: new Date().toISOString(),
    metadata: label ? { label } : undefined,
  };

  const keystore = await loadRaw();
  keystore.wallets[entry.id] = entry;
  await saveRaw(keystore);
  return entry;
}

export async function decryptWalletEntry(
  entry: WalletEntry,
  password: string,
): Promise<string> {
  return decryptWithPassword(
    { encrypted: entry.encryptedPrivateKey },
    password,
  );
}

export async function deleteWallet(
  walletId: string,
  password: string,
): Promise<void> {
  const keystore = await loadRaw();
  const entry = keystore.wallets[walletId];
  if (!entry) {
    throw new Error(`Wallet not found: ${walletId}`);
  }
  // Verify password by attempting decryption (proves ownership).
  await decryptWalletEntry(entry, password);
  delete keystore.wallets[walletId];
  await saveRaw(keystore);
}

export async function getWalletEntry(
  walletId: string,
): Promise<WalletEntry> {
  const keystore = await loadRaw();
  const entry = keystore.wallets[walletId];
  if (!entry) {
    throw new Error(`Wallet not found: ${walletId}`);
  }
  return entry;
}

export async function listWalletEntries(): Promise<WalletEntry[]> {
  const keystore = await loadRaw();
  return Object.values(keystore.wallets);
}
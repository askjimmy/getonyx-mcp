/**
 * Keystore types.
 *
 * Only chains with a local, keystore-backed wallet are listed here. Ambient is
 * not one of them: it is served by the Dynamic online wallet, so no Ambient
 * private key is ever written to disk.
 */

import type { ChainId } from '../chains/types.js';

export type { ChainId };

export interface WalletEntry {
  id: string;
  chain: ChainId;
  /** Public key / address in the chain's native encoding (base58 for SVM, hex for EVM). */
  address: string;
  /** base64-encoded [salt][iv][ciphertext+tag] */
  encryptedPrivateKey: string;
  createdAt: string;
  metadata?: {
    label?: string;
  };
}

export interface KeyStore {
  version: 1;
  wallets: Record<string, WalletEntry>;
}
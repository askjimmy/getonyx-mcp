/**
 * Keystore types.
 */

export type ChainId = 'ambient' | 'solana' | 'bsc' | 'arbitrum';

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
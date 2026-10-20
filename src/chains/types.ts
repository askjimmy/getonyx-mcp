/**
 * Chain configuration and wallet interface types.
 */

export type ChainId = 'ambient' | 'solana' | 'bsc' | 'arbitrum';
export type ChainType = 'svm' | 'evm';

export interface ChainConfig {
  id: ChainId;
  type: ChainType;
  rpcUrl: string;
  nativeToken: string;
  decimals: number;
  /** EVM only */
  chainId?: number;
  /** Display label */
  label: string;
}

/**
 * A transaction input accepted by `signTransaction` / `sendTransaction`.
 *
 * - EVM: standard JSON-RPC transaction fields.
 * - SVM: a base64-encoded serialized Solana Transaction.
 */
export interface EvmTransactionInput {
  to?: string;
  value?: string;
  data?: string;
  gasLimit?: string | number;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  nonce?: number;
  chainId?: number;
  from?: string;
}

export interface SvmTransactionInput {
  serialized: string; // base64-encoded Solana Transaction
}

export type TransactionInput = EvmTransactionInput | SvmTransactionInput;

export function isSvmTransaction(
  tx: TransactionInput,
): tx is SvmTransactionInput {
  return typeof (tx as any).serialized === 'string';
}

/**
 * Chain wallet interface.
 *
 * Each chain implementation knows how to generate, import, sign, and send
 * keys for its own format. The keystore manager decrypts the private key
 * and passes it to the chain implementation; the decrypted key is not
 * retained by the chain after the operation completes.
 */
export interface ChainWallet {
  readonly config: ChainConfig;

  /** Generate a new keypair. Returns the private key and address. */
  generate(): Promise<{ privateKey: string; address: string }>;

  /** Derive the address from a private key. */
  getAddress(privateKey: string): Promise<string>;

  /**
   * Sign a UTF-8 message with the private key.
   * Returns the signature in the chain's native encoding.
   */
  signMessage(
    privateKey: string,
    message: string,
  ): Promise<{ signature: string; address: string }>;

  /**
   * Sign a transaction with the private key.
   * Returns the signed transaction serialized as a string.
   */
  signTransaction(
    privateKey: string,
    tx: TransactionInput,
  ): Promise<{ signedTx: string; address: string }>;

  /**
   * Sign and broadcast a transaction. Returns the transaction hash.
   */
  sendTransaction(
    privateKey: string,
    tx: TransactionInput,
  ): Promise<{ hash: string }>;

  /** Query the native token balance of an address. */
  getBalance(address: string): Promise<string>;
}
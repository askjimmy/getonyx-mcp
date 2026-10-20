/**
 * Solana / SVM chain wallet implementation using @solana/web3.js.
 *
 * Private key formats accepted by `import`:
 *   - 64-byte secret key (seed + pubkey), base58-encoded
 *   - 32-byte seed, base58-encoded
 *   - 64-byte secret key as a JSON array of numbers
 *
 * Signed transactions are serialized as base64.
 * Signatures are base58-encoded.
 */

import { ed25519 } from '@noble/curves/ed25519';
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
} from '@solana/web3.js';
import bs58 from 'bs58';
import {
  ChainWallet,
  ChainConfig,
  SvmTransactionInput,
  TransactionInput,
} from './types.js';

export class SolanaWallet implements ChainWallet {
  readonly config: ChainConfig;
  private connection: Connection;

  constructor(config: ChainConfig) {
    this.config = config;
    this.connection = new Connection(config.rpcUrl, 'confirmed');
  }

  async generate(): Promise<{ privateKey: string; address: string }> {
    const kp = Keypair.generate();
    return { privateKey: bs58.encode(kp.secretKey), address: kp.publicKey.toBase58() };
  }

  async getAddress(privateKey: string): Promise<string> {
    const kp = this.parseKeypair(privateKey);
    return kp.publicKey.toBase58();
  }

  async signMessage(
    privateKey: string,
    message: string,
  ): Promise<{ signature: string; address: string }> {
    const kp = this.parseKeypair(privateKey);
    const data = new TextEncoder().encode(message);
    const signature = ed25519.sign(data, kp.secretKey.slice(0, 32));
    return { signature: bs58.encode(signature), address: kp.publicKey.toBase58() };
  }

  async signTransaction(
    privateKey: string,
    tx: TransactionInput,
  ): Promise<{ signedTx: string; address: string }> {
    const kp = this.parseKeypair(privateKey);
    const svmTx = tx as SvmTransactionInput;
    const raw = Buffer.from(svmTx.serialized, 'base64');
    const deserialized = Transaction.from(raw);
    deserialized.sign(kp);
    const signed = deserialized.serialize({ requireAllSignatures: false, verifySignatures: false });
    return { signedTx: signed.toString('base64'), address: kp.publicKey.toBase58() };
  }

  async sendTransaction(
    privateKey: string,
    tx: TransactionInput,
  ): Promise<{ hash: string }> {
    const kp = this.parseKeypair(privateKey);
    const svmTx = tx as SvmTransactionInput;
    const raw = Buffer.from(svmTx.serialized, 'base64');
    const deserialized = Transaction.from(raw);
    deserialized.sign(kp);
    const signature = await this.connection.sendRawTransaction(
      deserialized.serialize({ requireAllSignatures: false, verifySignatures: false }),
      { skipPreflight: false, preflightCommitment: 'confirmed' },
    );
    return { hash: signature };
  }

  async getBalance(address: string): Promise<string> {
    const pubkey = new PublicKey(address);
    const lamports = await this.connection.getBalance(pubkey);
    return (lamports / 1e9).toString();
  }

  /**
   * Parse a private key string into a Keypair.
   *
   * Accepts:
   *   - base58-encoded 64-byte secret key (seed + pubkey)
   *   - base58-encoded 32-byte seed
   *   - JSON array of numbers (64 bytes)
   */
  private parseKeypair(privateKey: string): Keypair {
    // Try JSON array first.
    if (privateKey.trim().startsWith('[')) {
      try {
        const arr = JSON.parse(privateKey) as number[];
        if (arr.length === 64) {
          return Keypair.fromSecretKey(Uint8Array.from(arr));
        }
        if (arr.length === 32) {
          return Keypair.fromSeed(Uint8Array.from(arr));
        }
      } catch {
        // fall through
      }
    }

    try {
      const decoded = bs58.decode(privateKey);
      if (decoded.length === 64) {
        return Keypair.fromSecretKey(decoded);
      }
      if (decoded.length === 32) {
        return Keypair.fromSeed(decoded);
      }
    } catch {
      // not base58
    }

    // Try hex.
    const hex = privateKey.startsWith('0x') ? privateKey.slice(2) : privateKey;
    if (/^[0-9a-fA-F]+$/.test(hex)) {
      const bytes = Buffer.from(hex, 'hex');
      if (bytes.length === 64) {
        return Keypair.fromSecretKey(bytes);
      }
      if (bytes.length === 32) {
        return Keypair.fromSeed(bytes);
      }
    }

    throw new Error(
      `Invalid Solana private key: expected 64-byte secret key or 32-byte seed (base58, hex, or JSON array)`,
    );
  }
}
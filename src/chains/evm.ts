/**
 * EVM chain wallet implementation using ethers v6.
 *
 * Supports BSC and Arbitrum One (both are EVM L2s).
 *
 * Private key format: 0x-prefixed 64-hex-char (32 bytes).
 * Signed transactions: serialized hex string (RLP-encoded).
 * Signatures: hex string.
 */

import { ethers } from 'ethers';
import {
  ChainWallet,
  ChainConfig,
  EvmTransactionInput,
  TransactionInput,
} from './types.js';

export class EvmWallet implements ChainWallet {
  readonly config: ChainConfig;
  private provider: ethers.JsonRpcProvider;

  constructor(config: ChainConfig) {
    this.config = config;
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
  }

  async generate(): Promise<{ privateKey: string; address: string }> {
    const wallet = ethers.Wallet.createRandom();
    return { privateKey: wallet.privateKey, address: wallet.address };
  }

  async getAddress(privateKey: string): Promise<string> {
    return new ethers.Wallet(privateKey).address;
  }

  async signMessage(
    privateKey: string,
    message: string,
  ): Promise<{ signature: string; address: string }> {
    const wallet = new ethers.Wallet(privateKey);
    const signature = await wallet.signMessage(message);
    return { signature, address: wallet.address };
  }

  async signTransaction(
    privateKey: string,
    tx: TransactionInput,
  ): Promise<{ signedTx: string; address: string }> {
    const wallet = new ethers.Wallet(privateKey);
    const evmTx = tx as EvmTransactionInput;
    const populated = await this.populateTransaction(evmTx, wallet.address);
    const signedTx = await wallet.signTransaction(populated);
    return { signedTx, address: wallet.address };
  }

  async sendTransaction(
    privateKey: string,
    tx: TransactionInput,
  ): Promise<{ hash: string }> {
    const wallet = new ethers.Wallet(privateKey).connect(this.provider);
    const evmTx = tx as EvmTransactionInput;
    const populated = await this.populateTransaction(evmTx, wallet.address);
    const sent = await wallet.sendTransaction(populated);
    return { hash: sent.hash };
  }

  async getBalance(address: string): Promise<string> {
    const balance = await this.provider.getBalance(address);
    return ethers.formatUnits(balance, this.config.decimals);
  }

  /**
   * Fill in missing fields (gas, nonce, chainId, type) using provider estimates.
   */
  private async populateTransaction(
    tx: EvmTransactionInput,
    from: string,
  ): Promise<ethers.TransactionLike> {
    const provider = this.provider;
    const base: ethers.TransactionLike = {
      to: tx.to ? (tx.to as `0x${string}`) : undefined,
      value: tx.value !== undefined ? BigInt(tx.value) : 0n,
      data: (tx.data as `0x${string}`) || '0x',
      chainId: tx.chainId ?? this.config.chainId,
    };

    if (tx.gasLimit !== undefined) {
      base.gasLimit = BigInt(tx.gasLimit);
    }
    if (tx.nonce !== undefined) {
      base.nonce = tx.nonce;
    }

    // EIP-1559 defaults.
    const feeData = await provider.getFeeData();
    base.maxFeePerGas =
      tx.maxFeePerGas !== undefined ? BigInt(tx.maxFeePerGas) : feeData.maxFeePerGas ?? undefined;
    base.maxPriorityFeePerGas =
      tx.maxPriorityFeePerGas !== undefined
        ? BigInt(tx.maxPriorityFeePerGas)
        : feeData.maxPriorityFeePerGas ?? undefined;
    base.gasPrice =
      tx.gasPrice !== undefined ? BigInt(tx.gasPrice) : feeData.gasPrice ?? undefined;

    // Auto-estimate gas if not provided.
    if (base.gasLimit === undefined) {
      base.gasLimit = await provider.estimateGas({ ...base, from });
    }

    return base;
  }
}
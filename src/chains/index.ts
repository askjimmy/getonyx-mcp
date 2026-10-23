/**
 * Chain registry and factory.
 *
 * Maps chain IDs to their configuration and wallet implementation.
 */

import { ChainConfig, ChainWallet, ChainId } from './types.js';
import { EvmWallet } from './evm.js';
import { SolanaWallet } from './solana.js';

export const CHAIN_CONFIGS: Record<ChainId, ChainConfig> = {
  solana: {
    id: 'solana',
    type: 'svm',
    rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
    nativeToken: 'SOL',
    decimals: 9,
    label: 'Solana',
  },
  bsc: {
    id: 'bsc',
    type: 'evm',
    chainId: 56,
    rpcUrl: process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org/',
    nativeToken: 'BNB',
    decimals: 18,
    label: 'BSC',
  },
  arbitrum: {
    id: 'arbitrum',
    type: 'evm',
    chainId: 42161,
    rpcUrl: process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc',
    nativeToken: 'ETH',
    decimals: 18,
    label: 'Arbitrum One',
  },
};

export function getChainConfig(chainId: ChainId): ChainConfig {
  const cfg = CHAIN_CONFIGS[chainId];
  if (!cfg) {
    throw new Error(`Unknown chain: ${chainId}`);
  }
  return cfg;
}

export function getChainWallet(chainId: ChainId): ChainWallet {
  const cfg = getChainConfig(chainId);
  if (cfg.type === 'evm') {
    return new EvmWallet(cfg);
  }
  return new SolanaWallet(cfg);
}

export function listChainIds(): ChainId[] {
  return Object.keys(CHAIN_CONFIGS) as ChainId[];
}

export function isChainId(value: string): value is ChainId {
  return value in CHAIN_CONFIGS;
}
/**
 * Wallet management MCP tools.
 *
 * Implements all 10 wallet operations:
 *   wallet_generate, wallet_import, wallet_export, wallet_get_public_key,
 *   wallet_sign_message, wallet_sign_transaction, wallet_send_transaction,
 *   wallet_list, wallet_delete, wallet_get_balance
 */

import { ToolDefinition, ToolResponse } from './types.js';
import {
  generateWallet,
  importWallet,
  deleteWallet,
  getWalletEntry,
  listWalletEntries,
  decryptWalletEntry,
} from '../keystore/index.js';
import { getChainWallet, isChainId } from '../chains/index.js';

export const walletTools: ToolDefinition[] = [
  {
    name: 'wallet_generate',
    description: 'Generate a new keypair, encrypt it with the provided password, and store it in the keystore.',
    inputSchema: {
      type: 'object',
      properties: {
        chain: { type: 'string', description: 'Chain ID (ambient, solana, bsc, arbitrum)' },
        password: { type: 'string', description: 'Encryption password for the keystore' },
        label: { type: 'string', description: 'Optional label for the wallet' },
      },
      required: ['chain', 'password'],
    },
  },
  {
    name: 'wallet_import',
    description: 'Import an existing private key, encrypt it, and store it in the keystore.',
    inputSchema: {
      type: 'object',
      properties: {
        chain: { type: 'string', description: 'Chain ID (ambient, solana, bsc, arbitrum)' },
        privateKey: { type: 'string', description: 'Private key in chain-native format (hex for EVM, base58 for SVM)' },
        password: { type: 'string', description: 'Encryption password for the keystore' },
        label: { type: 'string', description: 'Optional label for the wallet' },
      },
      required: ['chain', 'privateKey', 'password'],
    },
  },
  {
    name: 'wallet_export',
    description: 'Export a stored private key (requires password to decrypt).',
    inputSchema: {
      type: 'object',
      properties: {
        walletId: { type: 'string', description: 'Wallet ID (UUID)' },
        password: { type: 'string', description: 'Keystore password to decrypt the private key' },
      },
      required: ['walletId', 'password'],
    },
  },
  {
    name: 'wallet_get_public_key',
    description: 'Get the public key / address of a stored wallet.',
    inputSchema: {
      type: 'object',
      properties: {
        walletId: { type: 'string', description: 'Wallet ID (UUID)' },
      },
      required: ['walletId'],
    },
  },
  {
    name: 'wallet_sign_message',
    description: 'Sign an arbitrary message with a stored wallet.',
    inputSchema: {
      type: 'object',
      properties: {
        walletId: { type: 'string', description: 'Wallet ID (UUID)' },
        password: { type: 'string', description: 'Keystore password to decrypt the private key' },
        message: { type: 'string', description: 'Message to sign (UTF-8 text)' },
      },
      required: ['walletId', 'password', 'message'],
    },
  },
  {
    name: 'wallet_sign_transaction',
    description: 'Sign a transaction with a stored wallet (does not broadcast). For EVM, provide standard tx fields; for SVM, provide a base64-serialized transaction.',
    inputSchema: {
      type: 'object',
      properties: {
        walletId: { type: 'string', description: 'Wallet ID (UUID)' },
        password: { type: 'string', description: 'Keystore password to decrypt the private key' },
        transaction: {
          type: 'object',
          description: 'Transaction input (SVM: {serialized} / EVM: {to,value,data,gasLimit,gasPrice,nonce,chainId})',
        },
      },
      required: ['walletId', 'password', 'transaction'],
    },
  },
  {
    name: 'wallet_send_transaction',
    description: 'Sign and broadcast a transaction. Fills in missing gas/nonce params from the RPC provider.',
    inputSchema: {
      type: 'object',
      properties: {
        walletId: { type: 'string', description: 'Wallet ID (UUID)' },
        password: { type: 'string', description: 'Keystore password to decrypt the private key' },
        transaction: {
          type: 'object',
          description: 'Transaction input (SVM: {serialized} / EVM: {to,value,data,gasLimit,gasPrice,nonce,chainId})',
        },
      },
      required: ['walletId', 'password', 'transaction'],
    },
  },
  {
    name: 'wallet_list',
    description: 'List all stored wallets (addresses and metadata only, no private keys).',
    inputSchema: {
      type: 'object',
      properties: {
        chain: { type: 'string', description: 'Optional: filter by chain ID' },
      },
    },
  },
  {
    name: 'wallet_delete',
    description: 'Delete a stored wallet (requires password to confirm ownership).',
    inputSchema: {
      type: 'object',
      properties: {
        walletId: { type: 'string', description: 'Wallet ID (UUID)' },
        password: { type: 'string', description: 'Keystore password to verify ownership' },
      },
      required: ['walletId', 'password'],
    },
  },
  {
    name: 'wallet_get_balance',
    description:
      'Query the native token balance of a stored wallet. Native token: AMB on Ambient (wAMB when held in a market), SOL on Solana, BNB on BSC, ETH on Arbitrum.',
    inputSchema: {
      type: 'object',
      properties: {
        walletId: { type: 'string', description: 'Wallet ID (UUID)' },
      },
      required: ['walletId'],
    },
  },
];

export async function handleWalletTool(
  name: string,
  args: Record<string, any>,
): Promise<ToolResponse> {
  try {
    switch (name) {
      case 'wallet_generate':
        return await handleGenerate(args);
      case 'wallet_import':
        return await handleImport(args);
      case 'wallet_export':
        return await handleExport(args);
      case 'wallet_get_public_key':
        return await handleGetPublicKey(args);
      case 'wallet_sign_message':
        return await handleSignMessage(args);
      case 'wallet_sign_transaction':
        return await handleSignTransaction(args);
      case 'wallet_send_transaction':
        return await handleSendTransaction(args);
      case 'wallet_list':
        return await handleList(args);
      case 'wallet_delete':
        return await handleDelete(args);
      case 'wallet_get_balance':
        return await handleGetBalance(args);
      default:
        throw new Error(`Unknown wallet tool: ${name}`);
    }
  } catch (err: any) {
    return {
      content: [{ type: 'text', text: `Error: ${err.message}` }],
      isError: true,
    };
  }
}

// ---- Tool handlers ----

async function handleGenerate(args: Record<string, any>): Promise<ToolResponse> {
  const chain = args.chain as string;
  if (!isChainId(chain)) {
    throw new Error(`Invalid chain: ${chain}. Must be one of: ambient, solana, bsc, arbitrum`);
  }
  const entry = await generateWallet(chain, args.password as string, args.label as string | undefined);
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          { walletId: entry.id, chain: entry.chain, address: entry.address, createdAt: entry.createdAt },
          null,
          2,
        ),
      },
    ],
  };
}

async function handleImport(args: Record<string, any>): Promise<ToolResponse> {
  const chain = args.chain as string;
  if (!isChainId(chain)) {
    throw new Error(`Invalid chain: ${chain}`);
  }
  const entry = await importWallet(
    chain,
    args.privateKey as string,
    args.password as string,
    args.label as string | undefined,
  );
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          { walletId: entry.id, chain: entry.chain, address: entry.address, createdAt: entry.createdAt },
          null,
          2,
        ),
      },
    ],
  };
}

async function handleExport(args: Record<string, any>): Promise<ToolResponse> {
  const entry = await getWalletEntry(args.walletId as string);
  const privateKey = await decryptWalletEntry(entry, args.password as string);
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          { walletId: entry.id, chain: entry.chain, address: entry.address, privateKey },
          null,
          2,
        ),
      },
    ],
  };
}

async function handleGetPublicKey(args: Record<string, any>): Promise<ToolResponse> {
  const entry = await getWalletEntry(args.walletId as string);
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          { walletId: entry.id, chain: entry.chain, address: entry.address },
          null,
          2,
        ),
      },
    ],
  };
}

async function handleSignMessage(args: Record<string, any>): Promise<ToolResponse> {
  const entry = await getWalletEntry(args.walletId as string);
  const privateKey = await decryptWalletEntry(entry, args.password as string);
  const chainWallet = getChainWallet(entry.chain);
  const result = await chainWallet.signMessage(privateKey, args.message as string);
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          { walletId: entry.id, address: result.address, signature: result.signature },
          null,
          2,
        ),
      },
    ],
  };
}

async function handleSignTransaction(args: Record<string, any>): Promise<ToolResponse> {
  const entry = await getWalletEntry(args.walletId as string);
  const privateKey = await decryptWalletEntry(entry, args.password as string);
  const chainWallet = getChainWallet(entry.chain);
  const result = await chainWallet.signTransaction(privateKey, args.transaction);
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          { walletId: entry.id, address: result.address, signedTx: result.signedTx },
          null,
          2,
        ),
      },
    ],
  };
}

async function handleSendTransaction(args: Record<string, any>): Promise<ToolResponse> {
  const entry = await getWalletEntry(args.walletId as string);
  const privateKey = await decryptWalletEntry(entry, args.password as string);
  const chainWallet = getChainWallet(entry.chain);
  const result = await chainWallet.sendTransaction(privateKey, args.transaction);
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          { walletId: entry.id, hash: result.hash },
          null,
          2,
        ),
      },
    ],
  };
}

async function handleList(args: Record<string, any>): Promise<ToolResponse> {
  const entries = await listWalletEntries();
  const chainFilter = args.chain as string | undefined;
  const filtered = chainFilter
    ? entries.filter((e) => e.chain === chainFilter)
    : entries;
  const list = filtered.map((e) => ({
    walletId: e.id,
    chain: e.chain,
    address: e.address,
    createdAt: e.createdAt,
    label: e.metadata?.label,
  }));
  return {
    content: [{ type: 'text', text: JSON.stringify({ wallets: list, count: list.length }, null, 2) }],
  };
}

async function handleDelete(args: Record<string, any>): Promise<ToolResponse> {
  const entry = await getWalletEntry(args.walletId as string);
  await deleteWallet(entry.id, args.password as string);
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ deleted: entry.id, address: entry.address, chain: entry.chain }),
      },
    ],
  };
}

async function handleGetBalance(args: Record<string, any>): Promise<ToolResponse> {
  const entry = await getWalletEntry(args.walletId as string);
  const chainWallet = getChainWallet(entry.chain);
  const balance = await chainWallet.getBalance(entry.address);
  const { nativeToken, wrappedNativeToken } = chainWallet.config;
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            walletId: entry.id,
            address: entry.address,
            chain: entry.chain,
            balance,
            token: nativeToken,
            ...(wrappedNativeToken ? { wrappedToken: wrappedNativeToken } : {}),
          },
          null,
          2,
        ),
      },
    ],
  };
}

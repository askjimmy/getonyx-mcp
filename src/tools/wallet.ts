/**
 * Wallet management MCP tools.
 *
 * Two families of wallets:
 *   - Local (keystore-backed): solana, bsc, arbitrum. Keys are encrypted at
 *     rest in the keystore file.
 *   - Ambient: Dynamic online wallet. No private key is ever stored on disk —
 *     the key lives in Dynamic's MPC and only ever produces signatures.
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
import { getChainWallet, isChainId, listChainIds } from '../chains/index.js';
import { sendEmailOtp, verifyEmailOtp, signOut, getSessionStatus } from '../dynamic/auth.js';
import {
  signAmbientTransaction,
  sendAmbientTransaction,
  getAmbientBalance,
} from '../dynamic/ambient.js';
import { loadSession } from '../dynamic/session.js';

/** Pseudo wallet id used to address the Dynamic Ambient session. */
const DYNAMIC_WALLET_ID = 'dynamic-ambient';

const LOCAL_CHAIN_LIST = 'solana, bsc, arbitrum';

export const walletTools: ToolDefinition[] = [
  {
    name: 'wallet_sign_in_email',
    description:
      'Send an OTP to an email address to sign in / sign up the Dynamic Ambient wallet. Follow with wallet_verify_email.',
    inputSchema: {
      type: 'object',
      properties: {
        email: { type: 'string', description: 'Email address' },
      },
      required: ['email'],
    },
  },
  {
    name: 'wallet_verify_email',
    description:
      'Verify the OTP code and authenticate the Dynamic Ambient wallet. On first sign-in an Ambient wallet is created and its address is returned.',
    inputSchema: {
      type: 'object',
      properties: {
        email: { type: 'string', description: 'Email address' },
        verificationUUID: { type: 'string', description: 'Verification UUID from sign in' },
        code: { type: 'string', description: 'OTP code' },
      },
      required: ['email', 'verificationUUID', 'code'],
    },
  },
  {
    name: 'wallet_sign_out',
    description:
      'Sign out and clear the Dynamic Ambient wallet session (JWT + session key + wallet metadata).',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'wallet_status',
    description:
      'Get the Dynamic Ambient wallet authentication status (authenticated, address, expiry).',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'wallet_generate',
    description:
      'Generate a new keypair, encrypt it with the provided password, and store it in the keystore. Local chains only (solana, bsc, arbitrum) — Ambient uses the Dynamic online wallet (wallet_sign_in_email / wallet_verify_email).',
    inputSchema: {
      type: 'object',
      properties: {
        chain: { type: 'string', description: `Chain ID (${LOCAL_CHAIN_LIST})` },
        password: { type: 'string', description: 'Encryption password for the keystore' },
        label: { type: 'string', description: 'Optional label for the wallet' },
      },
      required: ['chain', 'password'],
    },
  },
  {
    name: 'wallet_import',
    description:
      'Import an existing private key, encrypt it, and store it in the keystore. Local chains only (solana, bsc, arbitrum) — Ambient keys are managed by Dynamic.',
    inputSchema: {
      type: 'object',
      properties: {
        chain: { type: 'string', description: `Chain ID (${LOCAL_CHAIN_LIST})` },
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
    description:
      'Get the public key / address of a stored wallet. Pass walletId "dynamic-ambient" (or omit walletId) for the Dynamic Ambient wallet.',
    inputSchema: {
      type: 'object',
      properties: {
        walletId: { type: 'string', description: 'Wallet ID (UUID), or "dynamic-ambient"' },
      },
    },
  },
  {
    name: 'wallet_sign_message',
    description: 'Sign an arbitrary message with a stored wallet (local chains only).',
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
    description:
      'Sign a transaction (does not broadcast). Local chains: pass walletId + password and the transaction ({serialized} base64 for Solana, EVM fields for BSC/Arbitrum). Ambient: sign in with wallet_sign_in_email / wallet_verify_email first, then omit walletId and pass {unsignedTxBase64} — the Ambient wallet must be the fee payer of the transaction.',
    inputSchema: {
      type: 'object',
      properties: {
        walletId: { type: 'string', description: 'Wallet ID (UUID) — omit for the Dynamic Ambient wallet' },
        password: { type: 'string', description: 'Keystore password to decrypt the private key (local chains only)' },
        chain: { type: 'string', description: 'Optional: "ambient" to target the Dynamic Ambient wallet explicitly' },
        transaction: {
          type: 'object',
          description:
            'Transaction input (local Solana: {serialized} / EVM: {to,value,data,gasLimit,gasPrice,nonce,chainId}; Ambient: {unsignedTxBase64})',
        },
      },
      required: ['transaction'],
    },
  },
  {
    name: 'wallet_send_transaction',
    description:
      'Sign and broadcast a transaction. Local chains: pass walletId + password and the transaction ({serialized} base64 for Solana, EVM fields for BSC/Arbitrum). Ambient: sign in with wallet_sign_in_email / wallet_verify_email first, then omit walletId and pass {unsignedTxBase64} — the Ambient wallet must be the fee payer of the transaction. Fills in missing gas/nonce params from the RPC provider for EVM chains.',
    inputSchema: {
      type: 'object',
      properties: {
        walletId: { type: 'string', description: 'Wallet ID (UUID) — omit for the Dynamic Ambient wallet' },
        password: { type: 'string', description: 'Keystore password to decrypt the private key (local chains only)' },
        chain: { type: 'string', description: 'Optional: "ambient" to target the Dynamic Ambient wallet explicitly' },
        transaction: {
          type: 'object',
          description:
            'Transaction input (local Solana: {serialized} / EVM: {to,value,data,gasLimit,gasPrice,nonce,chainId}; Ambient: {unsignedTxBase64})',
        },
      },
      required: ['transaction'],
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
      'Query the native token balance of a wallet. Native token: AMB on Ambient (Dynamic wallet), SOL on Solana, BNB on BSC, ETH on Arbitrum.',
    inputSchema: {
      type: 'object',
      properties: {
        walletId: { type: 'string', description: 'Wallet ID (UUID), or "dynamic-ambient"' },
      },
    },
  },
];

export async function handleWalletTool(
  name: string,
  args: Record<string, any>,
): Promise<ToolResponse> {
  try {
    switch (name) {
      case 'wallet_sign_in_email':
        return await handleSignInEmail(args);
      case 'wallet_verify_email':
        return await handleVerifyEmail(args);
      case 'wallet_sign_out':
        return await handleSignOut();
      case 'wallet_status':
        return await handleStatus();
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

/**
 * Guard for tools that only work with a keystore-backed wallet.
 *
 * The Ambient wallet is online (Dynamic) and has no key in the keystore, so
 * exporting, deleting or message-signing with it is not possible.
 */
function assertLocalWalletId(walletId: unknown): void {
  if (!walletId) {
    throw new Error('walletId is required');
  }
  if (walletId === DYNAMIC_WALLET_ID) {
    throw new Error(
      'The Ambient wallet is a Dynamic online wallet — it has no key in the keystore. ' +
        'Use wallet_sign_transaction / wallet_send_transaction to sign with it.',
    );
  }
}

/**
 * Normalize the transaction input for local chains.
 *
 * The market server returns `{ transaction: "<base64>" }`; accept both that
 * shape and the explicit `{ serialized }` / `{ unsignedTxBase64 }` objects.
 */
function normalizeLocalTx(transaction: any): Record<string, any> {
  if (!transaction || typeof transaction !== 'object') {
    throw new Error('transaction is required');
  }
  if (typeof transaction.serialized !== 'string' && typeof transaction.unsignedTxBase64 === 'string') {
    return { ...transaction, serialized: transaction.unsignedTxBase64 };
  }
  return transaction;
}

async function handleSignInEmail(args: Record<string, any>): Promise<ToolResponse> {
  const email = args.email as string;
  const result = await sendEmailOtp(email);
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          { success: true, verificationUUID: result.verificationUUID, message: 'OTP sent to email' },
          null,
          2,
        ),
      },
    ],
  };
}

async function handleVerifyEmail(args: Record<string, any>): Promise<ToolResponse> {
  const result = await verifyEmailOtp({
    email: args.email as string,
    verificationUUID: args.verificationUUID as string,
    code: args.code as string,
  });
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            success: true,
            address: result.address,
            chain: 'ambient',
            expiresAt: result.session.expiresAt,
            message: 'Authenticated',
          },
          null,
          2,
        ),
      },
    ],
  };
}

async function handleSignOut(): Promise<ToolResponse> {
  await signOut();
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ success: true, message: 'Signed out' }, null, 2),
      },
    ],
  };
}

async function handleStatus(): Promise<ToolResponse> {
  const status = await getSessionStatus();
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(status, null, 2),
      },
    ],
  };
}

async function handleGenerate(args: Record<string, any>): Promise<ToolResponse> {
  const chain = args.chain as string;
  if (!isChainId(chain)) {
    throw new Error(
      `Invalid chain: ${chain}. Local keystore wallets are available for: ${listChainIds().join(', ')}. ` +
        `Ambient is served by the Dynamic online wallet — use wallet_sign_in_email / wallet_verify_email.`,
    );
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
    throw new Error(
      `Invalid chain: ${chain}. Local keystore wallets are available for: ${listChainIds().join(', ')}. ` +
        `Ambient keys are managed by Dynamic and cannot be imported locally.`,
    );
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
  assertLocalWalletId(args.walletId);
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
  if (!args.walletId || args.walletId === DYNAMIC_WALLET_ID) {
    const session = await loadSession();
    if (session) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                walletId: DYNAMIC_WALLET_ID,
                address: session.walletMetadata.accountAddress,
                chain: 'ambient',
                source: 'dynamic',
              },
              null,
              2,
            ),
          },
        ],
      };
    }
    if (!args.walletId) {
      throw new Error('No walletId provided and no Dynamic session');
    }
  }
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
  assertLocalWalletId(args.walletId);
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

/**
 * Whether the request targets the Dynamic Ambient wallet.
 *
 * Ambient is explicit (`chain: "ambient"`) or implied by an unsigned Ambient
 * transaction without a local `walletId`.
 */
function isAmbientRequest(args: Record<string, any>): boolean {
  const chain = typeof args.chain === 'string' ? args.chain.toLowerCase() : undefined;
  if (chain === 'ambient') return true;
  if (args.walletId) return false;
  const tx = args.transaction as any;
  return typeof tx?.unsignedTxBase64 === 'string';
}

/** Pull the base64-encoded unsigned transaction out of the tool arguments. */
function extractAmbientTx(args: Record<string, any>): string {
  const tx = args.transaction as any;
  const base64 = tx?.unsignedTxBase64 ?? tx?.serialized;
  if (typeof base64 !== 'string' || base64.length === 0) {
    throw new Error(
      'Ambient transactions require transaction.unsignedTxBase64 (base64-encoded unsigned transaction).',
    );
  }
  return base64;
}

async function handleSignTransaction(args: Record<string, any>): Promise<ToolResponse> {
  if (isAmbientRequest(args)) {
    const result = await signAmbientTransaction(extractAmbientTx(args));
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              chain: 'ambient',
              address: result.address,
              signature: result.signature,
              signedTx: result.signedTx,
              signed: true,
            },
            null,
            2,
          ),
        },
      ],
    };
  }

  if (!args.walletId) {
    throw new Error('walletId is required for local chains (solana, bsc, arbitrum)');
  }
  if (!args.password) {
    throw new Error('password is required to decrypt the stored private key');
  }
  const entry = await getWalletEntry(args.walletId as string);
  const privateKey = await decryptWalletEntry(entry, args.password as string);
  const chainWallet = getChainWallet(entry.chain);
  const result = await chainWallet.signTransaction(privateKey, normalizeLocalTx(args.transaction));
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
  if (isAmbientRequest(args)) {
    const result = await sendAmbientTransaction(extractAmbientTx(args));
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              chain: 'ambient',
              address: result.address,
              signature: result.signature,
              txid: result.txid,
              signedTx: result.signedTx,
            },
            null,
            2,
          ),
        },
      ],
    };
  }

  if (!args.walletId) {
    throw new Error('walletId is required for local chains (solana, bsc, arbitrum)');
  }
  if (!args.password) {
    throw new Error('password is required to decrypt the stored private key');
  }
  const entry = await getWalletEntry(args.walletId as string);
  const privateKey = await decryptWalletEntry(entry, args.password as string);
  const chainWallet = getChainWallet(entry.chain);
  const result = await chainWallet.sendTransaction(privateKey, normalizeLocalTx(args.transaction));
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
  const list: Array<{
    walletId: string;
    chain: string;
    address: string;
    createdAt: string;
    label?: string;
  }> = filtered.map((e) => ({
    walletId: e.id,
    chain: e.chain,
    address: e.address,
    createdAt: e.createdAt,
    label: e.metadata?.label,
  }));
  
  // Add Dynamic Ambient session if exists
  try {
    const session = await loadSession();
    if (session) {
      if (!chainFilter || chainFilter === 'ambient') {
        list.push({
          walletId: DYNAMIC_WALLET_ID,
          chain: 'ambient',
          address: session.walletMetadata.accountAddress,
          createdAt: session.createdAt,
          label: session.email || 'Dynamic Ambient',
        });
      }
    }
  } catch {
    // A corrupt or unreadable session file must not break wallet listing.
  }

  return {
    content: [{ type: 'text', text: JSON.stringify({ wallets: list, count: list.length }, null, 2) }],
  };
}

async function handleDelete(args: Record<string, any>): Promise<ToolResponse> {
  assertLocalWalletId(args.walletId);
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
  if (!args.walletId || args.walletId === DYNAMIC_WALLET_ID) {
    const session = await loadSession();
    if (session) {
      const balance = await getAmbientBalance(session.walletMetadata.accountAddress);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                walletId: DYNAMIC_WALLET_ID,
                address: session.walletMetadata.accountAddress,
                chain: 'ambient',
                balance,
                token: 'AMB',
                source: 'dynamic',
              },
              null,
              2,
            ),
          },
        ],
      };
    }
    if (!args.walletId) throw new Error('No walletId and no Dynamic session');
  }
  const entry = await getWalletEntry(args.walletId as string);
  const chainWallet = getChainWallet(entry.chain);
  const balance = await chainWallet.getBalance(entry.address);
  const { nativeToken } = chainWallet.config;
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
          },
          null,
          2,
        ),
      },
    ],
  };
}

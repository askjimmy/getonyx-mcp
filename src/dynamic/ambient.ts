/**
 * Sign and broadcast Ambient (SVM) transactions with the Dynamic wallet.
 *
 * The private key never exists here: Dynamic holds it in MPC and returns a
 * signature, which is attached to the transaction before it is broadcast to
 * the Ambient RPC.
 */

import { Connection, PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import { addSignatureToTransaction, decodeBase58 } from '@dynamic-labs-wallet/node-svm';
import { createDynamicClient } from './client.js';
import {
  getAmbientChainId,
  getAmbientRpcUrl,
  getWalletPassword,
  shouldSkipPreflight,
} from './config.js';
import { requireSession } from './session.js';

/** Decimals of the Ambient native token (AMB). */
const AMB_DECIMALS = 9;

export function getAmbientConnection(): Connection {
  return new Connection(getAmbientRpcUrl(), 'confirmed');
}

/**
 * Deserialize a base64-encoded unsigned Ambient transaction.
 *
 * Handles both legacy `Transaction` and versioned (`v0`) transactions.
 */
export function deserializeAmbientTx(base64Tx: string): Transaction | VersionedTransaction {
  const raw = Buffer.from(base64Tx, 'base64');
  if (raw.length === 0) {
    throw new Error('Empty transaction payload');
  }

  // Versioned transactions start with the version prefix (0x80 | version);
  // legacy transactions start with a compact-u16 signature count.
  const looksVersioned = (raw[0] & 0x80) !== 0;

  if (looksVersioned) {
    try {
      return VersionedTransaction.deserialize(raw);
    } catch (err: any) {
      throw new Error(`Failed to deserialize versioned transaction: ${err.message}`);
    }
  }

  try {
    return Transaction.from(raw);
  } catch (err: any) {
    try {
      return VersionedTransaction.deserialize(raw);
    } catch {
      throw new Error(`Failed to deserialize transaction: ${err.message}`);
    }
  }
}

function serializeAmbientTx(tx: Transaction | VersionedTransaction): Buffer {
  if (tx instanceof VersionedTransaction) {
    return Buffer.from(tx.serialize());
  }
  return Buffer.from(tx.serialize({ requireAllSignatures: false, verifySignatures: false }));
}

/**
 * Attach a base58 signature to a transaction.
 *
 * Throws when the signer is not a required signer of the transaction — the
 * Ambient wallet must be the fee payer (or another required signer) of the
 * transaction it signs.
 */
export function attachAmbientSignature(
  tx: Transaction | VersionedTransaction,
  signatureBase58: string,
  signerAddress: string,
): Transaction | VersionedTransaction {
  return addSignatureToTransaction({
    transaction: tx,
    signature: decodeBase58(signatureBase58),
    signerPublicKey: new PublicKey(signerAddress),
  });
}

/**
 * Make sure the transaction carries a blockhash the chain still accepts.
 *
 * Blockhashes expire after ~150 slots, so a transaction built earlier (for
 * example by the market server) often carries a stale one and would be
 * rejected at broadcast time. The blockhash is only refreshed while the
 * transaction is still unsigned — changing it afterwards would invalidate any
 * signature that was already applied.
 */
async function refreshStaleBlockhash(tx: Transaction | VersionedTransaction): Promise<void> {
  if (tx instanceof VersionedTransaction) {
    if (tx.message.recentBlockhash) return;
    const { blockhash } = await getAmbientConnection().getLatestBlockhash();
    tx.message.recentBlockhash = blockhash;
    return;
  }

  const connection = getAmbientConnection();
  const current = tx.recentBlockhash ? new PublicKey(tx.recentBlockhash).toBase58() : null;
  if (current) {
    const valid = await connection.isBlockhashValid(current).catch(() => false);
    if (valid) return;
  }
  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
}

export interface AmbientSignResult {
  address: string;
  /** base58 Ed25519 signature produced by Dynamic. */
  signature: string;
  /** base64-encoded signed transaction, ready to broadcast. */
  signedTx: string;
}

/**
 * Sign an unsigned Ambient transaction with the Dynamic wallet.
 */
export async function signAmbientTransaction(
  unsignedTxBase64: string,
): Promise<AmbientSignResult> {
  const session = await requireSession();
  const address = session.walletMetadata.accountAddress;
  if (!address) {
    throw new Error('Dynamic session has no Ambient wallet address');
  }

  const client = await createDynamicClient(session);
  const tx = deserializeAmbientTx(unsignedTxBase64);
  await refreshStaleBlockhash(tx);

  let result: string | { signature: string; transaction: Transaction | VersionedTransaction };
  try {
    result = await client.signTransaction({
      walletMetadata: session.walletMetadata as any,
      transaction: tx,
      password: getWalletPassword(),
      externalServerKeyShares: session.externalServerKeyShares as any,
      chainId: getAmbientChainId(),
    });
  } catch (err: any) {
    throw new Error(
      `Dynamic signing failed: ${err.message}. ` +
        `If the Ambient wallet was created with a backup password, set WALLET_PASSWORD to it.`,
    );
  }

  const signature = typeof result === 'string' ? result : result.signature;
  const target = typeof result === 'string' ? tx : result.transaction;

  let signed: Transaction | VersionedTransaction;
  try {
    signed = attachAmbientSignature(target, signature, address);
  } catch (err: any) {
    throw new Error(
      `Failed to attach signature: ${err.message}. ` +
        `The Ambient wallet (${address}) must be the fee payer / signer of the transaction.`,
    );
  }

  return {
    address,
    signature,
    signedTx: serializeAmbientTx(signed).toString('base64'),
  };
}

export interface AmbientSendResult extends AmbientSignResult {
  /** Transaction id on the Ambient chain. */
  txid: string;
}

/**
 * Sign and broadcast an unsigned Ambient transaction.
 */
export async function sendAmbientTransaction(
  unsignedTxBase64: string,
): Promise<AmbientSendResult> {
  const signed = await signAmbientTransaction(unsignedTxBase64);
  const connection = getAmbientConnection();
  const raw = Buffer.from(signed.signedTx, 'base64');

  const txid = await connection.sendRawTransaction(raw, {
    skipPreflight: shouldSkipPreflight(),
    preflightCommitment: 'confirmed',
  });

  const confirmation = await connection.confirmTransaction(txid, 'confirmed');
  if (confirmation.value.err) {
    throw new Error(
      `Ambient transaction failed: ${JSON.stringify(confirmation.value.err)} (txid ${txid})`,
    );
  }

  return { ...signed, txid };
}

/**
 * Native AMB balance of an address (human units).
 */
export async function getAmbientBalance(address?: string): Promise<string> {
  let target = address;
  if (!target) {
    const session = await requireSession();
    target = session.walletMetadata.accountAddress;
  }
  if (!target) {
    throw new Error('No Ambient address to query');
  }
  const connection = getAmbientConnection();
  const lamports = await connection.getBalance(new PublicKey(target));
  return (lamports / 10 ** AMB_DECIMALS).toString();
}

/**
 * Sign and broadcast Ambient (SVM) transactions using Dynamic
 * Uses REST API approach
 */
import { Connection, PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import bs58 from 'bs58';
import { getSession } from './auth.js';

function getConnection(): Connection {
  const rpcUrl = process.env.AMBIENT_RPC_URL || 'https://rpc.ambient.xyz';
  return new Connection(rpcUrl, 'confirmed');
}

export async function signTransaction(unsignedTxBase64: string): Promise<string> {
  const session = await getSession();
  if (!session) {
    throw new Error('Not authenticated');
  }
  
  // For now, attempt to use Dynamic API if available
  // This is a simplified implementation
  throw new Error('Dynamic transaction signing requires additional setup. Use DYNAMIC_AUTH_TOKEN and ensure proper API access.');
}

export async function sendTransaction(unsignedTxBase64: string): Promise<{ signature: string; txid: string }> {
  const session = await getSession();
  if (!session) {
    throw new Error('Not authenticated');
  }
  
  // Deserialize and attempt to broadcast
  let tx: Transaction | VersionedTransaction;
  try {
    tx = Transaction.from(Buffer.from(unsignedTxBase64, 'base64'));
  } catch {
    try {
      tx = VersionedTransaction.deserialize(Buffer.from(unsignedTxBase64, 'base64'));
    } catch (e: any) {
      throw new Error(`Failed to deserialize transaction: ${e.message}`);
    }
  }
  
  throw new Error('Dynamic transaction signing not fully configured. Session authenticated but signing requires Dynamic SDK setup.');
}

export async function getAmbientBalance(): Promise<string> {
  const session = await getSession();
  if (!session) {
    throw new Error('Not authenticated');
  }
  const connection = getConnection();
  if (!session.walletMetadata.accountAddress) {
    throw new Error('No wallet address in session');
  }
  const pubkey = new PublicKey(session.walletMetadata.accountAddress);
  const balance = await connection.getBalance(pubkey);
  return balance.toString();
}


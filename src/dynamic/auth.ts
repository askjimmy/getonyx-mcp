/**
 * Dynamic email OTP auth flow for the Ambient wallet.
 *
 * Headless (no browser) sign-in:
 *   1. `connectToGetonyx`   — ask Dynamic to email a one-time code
 *   2. `verifyEmailOtp`  — exchange the code for a user JWT bound to a
 *                          session key, then provision/reuse the Ambient wallet
 *
 * The session key binding means a leaked JWT alone cannot sign: the keyshares
 * relay also requires a proof signed with the session private key.
 */

import { createAuthClient } from '@dynamic-labs-wallet/node';
import { generateSessionKeyPair } from '@dynamic-labs-wallet/node';
import type { JsonWebKey } from 'node:crypto';
import {
  DynamicSession,
  DynamicWalletMetadata,
  clearSession,
  loadSession,
  saveSession,
} from './session.js';
import { createDynamicClient, provisionAmbientWallet } from './client.js';
import { getEnvironmentId } from './config.js';

export async function connectToGetonyx(email: string): Promise<{ verificationUUID: string }> {
  const auth = createAuthClient({ environmentId: getEnvironmentId() });
  const { verificationUUID } = await auth.email.sendOtp(email);
  return { verificationUUID };
}

/**
 * Load the session key pair, generating one on first use.
 *
 * The key is persisted so the JWT minted for it stays valid across calls.
 * A stored key that is not a usable P-256 JWK (e.g. a placeholder written by
 * an older version) is replaced — the JWT minted for it could never be signed
 * for, so every signing attempt would fail.
 */
async function resolveSessionKeyPair(): Promise<{
  publicKeyHex: string;
  privateKeyJwk: JsonWebKey;
}> {
  const existing = await loadSession();
  if (isUsableSessionKey(existing?.privateKeyJwk) && existing?.publicKeyHex) {
    return {
      publicKeyHex: existing.publicKeyHex,
      privateKeyJwk: existing.privateKeyJwk,
    };
  }
  return generateSessionKeyPair();
}

function isUsableSessionKey(jwk: JsonWebKey | undefined): boolean {
  return Boolean(jwk && jwk.kty === 'EC' && jwk.crv === 'P-256' && jwk.d);
}

export async function verifyEmailOtp(params: {
  email: string;
  verificationUUID: string;
  code: string;
}): Promise<{ address: string; session: DynamicSession }> {
  const environmentId = getEnvironmentId();
  const { publicKeyHex, privateKeyJwk } = await resolveSessionKeyPair();

  const auth = createAuthClient({ environmentId });
  const result = await auth.email.verifyOtp({
    verificationUUID: params.verificationUUID,
    code: params.code,
    sessionPublicKey: publicKeyHex,
  }).catch((err: any) => {
    console.error('verifyOtp error:', err);
    throw err;
  });

  if (!result.jwt) {
    throw new Error('No JWT returned from verification');
  }

  const provisional: DynamicSession = {
    jwt: result.jwt,
    walletMetadata: {
      walletId: '',
      accountAddress: '',
      chainName: 'SVM',
      thresholdSignatureScheme: 'TWO_OF_TWO',
    },
    privateKeyJwk,
    publicKeyHex,
    email: params.email,
    createdAt: new Date().toISOString(),
    expiresAt: result.expiresAt
      ? typeof result.expiresAt === 'string'
        ? Date.parse(result.expiresAt) > 0
          ? new Date(result.expiresAt).toISOString()
          : undefined
        : typeof result.expiresAt === 'number' && result.expiresAt > 0
        ? new Date(result.expiresAt).toISOString()
        : undefined
      : undefined,
    environmentId,
  };

  const client = await createDynamicClient(provisional);
  const provisioned = await provisionAmbientWallet(client);

  const walletMetadata: DynamicWalletMetadata = provisioned.walletMetadata;
  const session: DynamicSession = {
    ...provisional,
    walletMetadata,
    externalServerKeyShares: provisioned.externalServerKeyShares,
  };

  await saveSession(session);
  return { address: walletMetadata.accountAddress, session };
}

export async function disconnect(): Promise<void> {
  await clearSession();
}

export async function getSessionStatus(): Promise<{
  authenticated: boolean;
  address?: string;
  chain?: string;
  environmentId?: string;
  email?: string;
  expiresAt?: string;
}> {
  const session = await loadSession();
  if (!session) {
    return { authenticated: false };
  }
  const expired = session.expiresAt ? Date.parse(session.expiresAt) <= Date.now() : false;
  return {
    authenticated: !expired,
    address: session.walletMetadata?.accountAddress,
    chain: 'ambient',
    environmentId: session.environmentId,
    email: session.email,
    expiresAt: session.expiresAt,
  };
}

export async function getSession(): Promise<DynamicSession | null> {
  return loadSession();
}

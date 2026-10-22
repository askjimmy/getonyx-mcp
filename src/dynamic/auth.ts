/**
 * Dynamic email OTP auth flow for Ambient wallet using REST API
 */
import { loadSession, saveSession, clearSession, DynamicSession } from './session.js';

const DYNAMIC_API_BASE = 'https://app.dynamicauth.com/api/v0/sdk';

function getEnvironmentId(): string {
  const envId = process.env.DYNAMIC_ENVIRONMENT_ID || 'a9e7161d-c693-44be-8183-2c104ec7264e';
  return envId;
}

function getAuthToken(): string | undefined {
  return process.env.DYNAMIC_AUTH_TOKEN;
}

export async function sendEmailOtp(email: string): Promise<{ verificationUUID: string }> {
  const environmentId = getEnvironmentId();
  const url = `${DYNAMIC_API_BASE}/${environmentId}/emailVerifications/create`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email }),
  });
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to send OTP: ${response.status} ${text}`);
  }
  
  const data = await response.json() as any;
  return { verificationUUID: data.verificationUUID };
}

export async function verifyEmailOtp(params: {
  email: string;
  verificationUUID: string;
  code: string;
}): Promise<{ address: string; session: DynamicSession }> {
  const environmentId = getEnvironmentId();
  const url = `${DYNAMIC_API_BASE}/${environmentId}/emailVerifications/signin`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ 
      verificationUUID: params.verificationUUID, 
      verificationToken: params.code 
    }),
  });
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to verify OTP: ${response.status} ${text}`);
  }
  
  const data = await response.json() as any;
  const jwt = data.jwt;
  if (!jwt) {
    throw new Error('No JWT returned from verification');
  }
  
  // Extract wallet info from JWT
  let accountAddress = '';
  try {
    const payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64').toString());
    // Prefer blockchain account address for solana/ambient
    if (Array.isArray(payload.blockchain_accounts)) {
      const sol = payload.blockchain_accounts.find((b: any) => b.chain === 'solana');
      if (sol?.address) accountAddress = sol.address;
      if (!accountAddress && payload.blockchain_accounts[0]?.address) {
        accountAddress = payload.blockchain_accounts[0].address;
      }
    }
    if (!accountAddress) {
      accountAddress = payload.sub || payload.wallet_public_key || payload.address || payload.public_key || '';
    }
  } catch (e) {
    // Ignore
  }
  
  const privateKeyJwk = { kty: 'OKP', crv: 'Ed25519' };
  const publicKeyHex = '';
  
  const walletMetadata = {
    accountAddress,
    chain: 'SOL',
  };
  
  const session: DynamicSession = {
    jwt,
    walletMetadata,
    privateKeyJwk,
    publicKeyHex,
    email: params.email,
    createdAt: new Date().toISOString(),
    environmentId,
  };
  
  await saveSession(session);
  return { address: accountAddress, session };
}

export async function signOut(): Promise<void> {
  await clearSession();
}

export async function getSessionStatus(): Promise<{
  authenticated: boolean;
  address?: string;
  chain?: string;
  environmentId?: string;
  email?: string;
}> {
  const session = await loadSession();
  if (!session) {
    return { authenticated: false };
  }
  return {
    authenticated: true,
    address: session.walletMetadata?.accountAddress,
    chain: 'ambient',
    environmentId: session.environmentId,
    email: session.email,
  };
}

export async function getSession() {
  return loadSession();
}


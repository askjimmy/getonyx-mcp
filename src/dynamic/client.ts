/**
 * Dynamic wallet client factory for the Ambient (SVM) chain.
 *
 * The SDK is stateless: every call needs the user's JWT plus the wallet
 * metadata for the wallet that should sign. Both are persisted in the session
 * store (see `session.ts`).
 */

import { randomUUID } from 'node:crypto';
import { DynamicSvmWalletClient } from '@dynamic-labs-wallet/node-svm';
import {
  ThresholdSignatureScheme,
  getExternalServerKeyShareBackupInfo,
  signSessionMessage,
} from '@dynamic-labs-wallet/node';
import { getEnvironmentId, getWalletPassword } from './config.js';
import { DynamicSession, DynamicWalletMetadata } from './session.js';

/** A key share held by this server for the Ambient wallet. */
export interface ServerKeyShare {
  [key: string]: any;
}

/**
 * Route prefix for the user-scoped Dynamic API.
 *
 * The node SDK targets the server-scoped routes (`/api/v0/server/...`), which
 * require an environment-wide API token. This server authenticates with the
 * *user* JWT instead, and the user-scoped routes (`/api/v0/sdk/...`) are the
 * ones that accept it — wallet listing, session nonces and the key-share
 * recovery endpoints all live there.
 */
const USER_SCOPED_ROUTE_PREFIX = '/api/v0/sdk';

/**
 * Point the SDK's API client at the user-scoped routes.
 *
 * The node SDK hardcodes the server-scoped prefix; without this the wallet
 * listing 404s and the key-share recovery POST is not routed at all.
 */
function useUserScopedRoutes(client: DynamicSvmWalletClient, environmentId: string): void {
  const apiClient = (client as any).apiClient;
  if (!apiClient) return;
  apiClient.sdkRoutePrefix = USER_SCOPED_ROUTE_PREFIX;
  apiClient.waasRoutePrefix = `${USER_SCOPED_ROUTE_PREFIX}/${environmentId}/waas`;
  apiClient.sdkWaasRoutePrefix = `${USER_SCOPED_ROUTE_PREFIX}/${environmentId}/waas`;
}

/**
 * Create a wallet client bound to the user's Dynamic session.
 *
 * The session key (`privateKeyJwk`) signs the session proof, so a leaked JWT
 * alone cannot drive signing.
 */
export async function createDynamicClient(
  session: DynamicSession,
): Promise<DynamicSvmWalletClient> {
  const environmentId = getEnvironmentId();
  const client = new DynamicSvmWalletClient({ environmentId });
  await client.authenticateJwt(session.jwt, {
    getSessionSignature: (message: string) => signSessionMessage(message, session.privateKeyJwk),
  });
  useUserScopedRoutes(client, environmentId);
  return client;
}

export interface ProvisionedWallet {
  walletMetadata: DynamicWalletMetadata;
  /** This server's key share for the wallet, when it was created here. */
  externalServerKeyShares: ServerKeyShare[];
  /** True when an existing wallet was reused instead of creating a new one. */
  reused: boolean;
}

/**
 * Return the user's Ambient wallet, creating one on first sign-in.
 *
 * The wallet lives in Dynamic's MPC (never as a raw private key on this
 * server). When a wallet password is configured the key shares are also
 * backed up to Dynamic, so the wallet survives a lost session file.
 */
export async function provisionAmbientWallet(
  client: DynamicSvmWalletClient,
): Promise<ProvisionedWallet> {
  const apiClient = (client as any).apiClient;
  let user: any;
  try {
    user = await apiClient.getUser(randomUUID());
  } catch (err: any) {
    throw new Error(`Failed to list Dynamic wallets: ${err.message}`);
  }

  const credentials: any[] = user?.verifiedCredentials ?? [];
  const svm = credentials.find(
    (vc) =>
      vc?.walletName === 'dynamicwaas' &&
      (vc?.chain || '').toLowerCase() === 'solana' &&
      !!vc?.address,
  );

  if (svm) {
    const properties = svm.walletProperties ?? {};
    return {
      walletMetadata: {
        walletId: svm.id,
        accountAddress: svm.address,
        chainName: 'SVM',
        thresholdSignatureScheme:
          properties.thresholdSignatureScheme ?? ThresholdSignatureScheme.TWO_OF_TWO,
        derivationPath: properties.derivationPath,
        shareSetId: properties.shareSetId,
        shareSetType: properties.shareSetType,
        externalServerKeySharesBackupInfo: getExternalServerKeyShareBackupInfo({
          walletProperties: properties,
        }),
      },
      externalServerKeyShares: [],
      reused: true,
    };
  }

  const password = getWalletPassword();
  const created = await client.createWalletAccount({
    thresholdSignatureScheme: ThresholdSignatureScheme.TWO_OF_TWO,
    password,
    backUpToDynamic: Boolean(password),
  });

  return {
    walletMetadata: created.walletMetadata as DynamicWalletMetadata,
    externalServerKeyShares: (created.externalServerKeyShares || []) as ServerKeyShare[],
    reused: false,
  };
}

/**
 * Environment configuration for the Dynamic (online) Ambient wallet.
 *
 * All values are optional — sensible defaults are used when unset.
 */

const DEFAULT_ENVIRONMENT_ID = 'a9e7161d-c693-44be-8183-2c104ec7264e';
const DEFAULT_AMBIENT_RPC_URL = 'https://rpc.ambient.xyz';

/**
 * Dynamic environment (project) id. The dapp and this server must use the
 * same one, otherwise wallets created in one are invisible to the other.
 */
export function getEnvironmentId(): string {
  return process.env.DYNAMIC_ENVIRONMENT_ID || DEFAULT_ENVIRONMENT_ID;
}

/** RPC endpoint of the Ambient chain (a Solana-compatible chain). */
export function getAmbientRpcUrl(): string {
  return process.env.AMBIENT_RPC_URL || DEFAULT_AMBIENT_RPC_URL;
}

/**
 * Chain identifier reported to Dynamic when signing an SVM transaction.
 *
 * The value is only used for policy screening; it must be a string. For
 * Solana-family networks Dynamic uses the network id, so this is configurable
 * to match the Ambient network registered in the Dynamic dashboard.
 */
export function getAmbientChainId(): string {
  return process.env.AMBIENT_CHAIN_ID || 'mainnet-beta';
}

/**
 * Password protecting the Dynamic wallet's encrypted key-share backup.
 * Only needed when the Ambient wallet was created with a backup password.
 */
export function getWalletPassword(): string | undefined {
  return process.env.WALLET_PASSWORD || undefined;
}

/**
 * Password used to encrypt the Dynamic session file at rest.
 *
 * When unset the session file is written as plaintext with 0600 permissions
 * and a warning is emitted — the JWT alone must never be readable by other
 * users on the host.
 */
export function getSessionPassword(): string | undefined {
  return process.env.DYNAMIC_SESSION_PASSWORD || process.env.WALLET_PASSWORD || undefined;
}

/**
 * Whether preflight simulation is skipped when broadcasting to Ambient.
 */
export function shouldSkipPreflight(): boolean {
  const raw = process.env.AMBIENT_SKIP_PREFLIGHT;
  return raw === '1' || raw?.toLowerCase() === 'true';
}

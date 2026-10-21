/**
 * Dynamic session storage for Ambient (online wallet)
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

export interface DynamicSession {
  jwt: string;
  walletMetadata: {
    accountAddress: string;
    chain: string;
    walletId?: string;
    walletName?: string;
    [key: string]: any;
  };
  privateKeyJwk: any;
  publicKeyHex: string;
  email?: string;
  createdAt: string;
  environmentId: string;
}

function getSessionPath(): string {
  const envPath = process.env.DYNAMIC_SESSION_PATH;
  if (envPath) return envPath;
  return path.join(os.homedir(), '.config', 'wallet-mcp-server', 'dynamic-session.json');
}

export async function loadSession(): Promise<DynamicSession | null> {
  const p = getSessionPath();
  try {
    const raw = await fs.promises.readFile(p, 'utf-8');
    return JSON.parse(raw) as DynamicSession;
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return null;
    }
    throw err;
  }
}

export async function saveSession(session: DynamicSession): Promise<void> {
  const p = getSessionPath();
  await fs.promises.mkdir(path.dirname(p), { recursive: true });
  const tmp = p + '.tmp';
  await fs.promises.writeFile(tmp, JSON.stringify(session, null, 2), 'utf-8');
  await fs.promises.rename(tmp, p);
}

export async function clearSession(): Promise<void> {
  const p = getSessionPath();
  try {
    await fs.promises.unlink(p);
  } catch (err: any) {
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }
}

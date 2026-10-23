# Production Readiness Review - Dynamic Ambient Wallet Integration

## Summary
The Ambient chain has **no local wallet**: it is served by a Dynamic-managed online wallet
(email + OTP). Ambient transactions are signed by Dynamic's MPC and broadcast to
`https://rpc.ambient.xyz`. Local keystore wallets remain for Solana, BSC and Arbitrum.

Implementation: `src/dynamic/{auth,client,ambient,session,config}.ts`, routed from
`src/tools/wallet.ts`.

## Issues Resolved Since The First Review

| Previous issue | Status | How it was fixed |
|---|---|---|
| JWT stored in plaintext | Fixed | The session file is encrypted with the same PBKDF2/AES-256-GCM scheme as the keystore when `DYNAMIC_SESSION_PASSWORD` (or `WALLET_PASSWORD`) is set. Without it the file is written in plaintext with `0600` permissions and a warning is printed to stderr. |
| No session key binding | Fixed | `generateSessionKeyPair()` (P-256) is created on first sign-in, bound into the JWT via `sessionPublicKey`, and used for `authenticateJwt(jwt, { getSessionSignature })`. A leaked JWT alone can no longer sign. |
| Incomplete wallet metadata extraction | Fixed | The wallet is provisioned through the SDK (`getWallets()` / `createWalletAccount`), so the full `walletMetadata` (including `externalServerKeySharesBackupInfo`) is persisted instead of being decoded from the JWT. |
| `signTransaction`/`sendTransaction` assumptions | Fixed | The SDK returns a base58 signature; it is decoded with `decodeBase58` and attached with `addSignatureToTransaction`. Legacy and versioned (v0) transactions are both handled, and a non-signer fee payer produces an explicit error. |
| No JWT expiry handling | Fixed | `expiresAt` is stored with the session, checked before every operation, and reported by `wallet_status`. |
| Contradictory chain error message | Fixed | `wallet_generate`/`wallet_import` reject `ambient` with a message pointing at the Dynamic tools. |

## Open Issues (Must Fix Before Production)

| Issue | Location | Severity | Details | Fix |
|---|---|---|---|---|
| MCP server has no auth | `src/server.ts` | Critical | stdio transport with no authentication — anyone with process access can call the signing tools. | Run behind auth (IAP/bearer), restrict to trusted clients. Do not expose publicly. |
| Session file falls back to plaintext | `src/dynamic/session.ts` | High | Without `DYNAMIC_SESSION_PASSWORD` the JWT and session key are written in plaintext (mode 0600). | Always set `DYNAMIC_SESSION_PASSWORD`; move the session to a KMS/OS keychain for production. |
| No rate limiting / OTP abuse protection | `src/dynamic/auth.ts` | Medium | No client-side throttling. Dynamic enforces 3 attempts / 10 min per email, but the server should also guard. | Add basic rate limiting per email/IP. |
| Session key stored alongside the JWT | `src/dynamic/session.ts` | Medium | The session key is what makes the JWT binding meaningful; storing both in one file means one file read defeats the binding. | Store the session key in a KMS/HSM or a separate secret store. |
| Long-lived credentials in env | `.env` | Medium | `WALLET_PASSWORD` protects the Dynamic key-share backup and is required to recover a wallet. | Keep it in a secret manager, rotate it, and prefer short-lived tokens. |
| No integration tests | repo | Medium | The Dynamic flow (OTP → provision → sign → broadcast) is only exercised manually. | Add a test that runs against a Dynamic test environment. |

## Good Practices Observed
- Ambient local generate/import blocked — the online wallet is the only Ambient wallet.
- Local wallets unchanged for the other chains (Solana, BSC, Arbitrum).
- Clear separation of the `dynamic/` modules from the keystore.
- The JWT is never logged nor returned in tool output.
- Sign-out deletes the stored JWT, session key and wallet metadata.

## Recommendations
1. **Security first**: always set `DYNAMIC_SESSION_PASSWORD`, put the wallet MCP behind auth, and keep it off the public network.
2. **Config**: fail fast on missing env vars once the deployment decides which ones are mandatory.
3. **Testing**: add an automated test for the OTP → provision → sign → broadcast path.
4. **Deployment**: treat the wallet MCP as a privileged service — auth, network restrictions, secret rotation.
5. **Docs**: README, `.env.example` and `dynamic-signing.md` describe the current behaviour.

## Production Readiness Verdict
**Usable for local development and trusted environments.** The critical cryptographic gaps from
the first review are closed. Before a production deployment, add authentication on the MCP
endpoint, make the encrypted session store mandatory, and move the session key out of the file.

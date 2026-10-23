# Plan: Switch Ambient wallet to Dynamic-managed online wallet

## Goal
Replace local keystore-based Ambient (SVM) wallet with Dynamic-managed online wallet for this wallet MCP server. Keep local wallet support for other chains (solana/bsc/arbitrum) if desired, but Ambient must use only Dynamic online wallet via email OTP. Support connect/disconnect, generate wallet on first login, sign+broadcast via RPC directly, show address, remove local Ambient wallet path.

## Requirements from req.md
1. Switch ambient wallet to online wallet managed by Dynamic (this wallet-mcp-server)
2. User can connect to ambient wallet by email with OTP / can disconnect
3. Also support connecting local wallet that handled current mcp tools (so non-ambient or as alternative?)
4. First login will generate new SVM wallet (Ambient wallet)
5. RPC URL https://rpc.ambient.xyz
6. Sign with wallet handled by Dynamic
7. Broadcast tx with RPC directly
8. User can see ambient wallet address
9. Remove local stored ambient wallet - use only online ambient wallet

## Findings from codebase
- This is `wallet-mcp-server` (separate from market server). Stores encrypted keys in keystore (keystore/index.ts), chain impl in src/chains/{solana,evm,...}, tools in src/tools/wallet.ts.
- Ambient is configured as SVM chain (src/chains/index.ts) with rpcUrl from AMBIENT_RPC_URL or default https://rpc.ambient.xyz, nativeToken 'AMB', wrappedNativeToken 'wAMB'.
- Current flow: all chains use local keystore (generate/import/sign/send via chain wallet using decrypted key).
- Need to add Dynamic auth/session management and Dynamic SVM wallet client for Ambient.
- dynamic-signing.md gives exact approach: email OTP via REST to Dynamic API, session key binding with JWT, use `@dynamic-labs-wallet/node-svm` + `@dynamic-labs-wallet/node`, signTransaction returns base58 sig -> attach via `addSignatureToTransaction`, broadcast with Connection to AMBIENT_RPC_URL.

## Decisions to make / approach
### Env vars (add to .env, not .env.local)
From dynamic-signing.md and req:
- `DYNAMIC_ENVIRONMENT_ID` = `a9e7161d-c693-44be-8183-2c104ec7264e` (same as dapp)
- `DYNAMIC_AUTH_TOKEN` (server-level, for authenticateApiToken if needed)
- `SESSION_PRIVATE_KEY_JWK` (generated or stored) - for session key binding
- `DYNAMIC_JWT` (per-user session) - can be stored in session store
- `AMBIENT_RPC_URL` = `https://rpc.ambient.xyz` (already there)
- `WALLET_PASSWORD` (only if embedded wallet backed up to Dynamic) - maybe optional

Also need session storage location (file-based like keystore, or in-memory). Since it's MCP stdio server, need persistent storage across calls. Store in config dir like keystore (e.g. dynamic-session.json). Follow security guidance - encrypt at rest if possible, never log JWT.

### New deps
Add to package.json:
- `@dynamic-labs-wallet/node` 
- `@dynamic-labs-wallet/node-svm`
- `@solana/web3.js` already present
- `bs58` already present
- maybe `node-fetch` or use built-in fetch

### New modules
- `src/dynamic/session.ts` - session storage (load/save/clear), generate session keypair
- `src/dynamic/auth.ts` - OTP flow (send OTP via REST, verify OTP), Dynamic client auth
- `src/dynamic/ambient.ts` - sign+broadcast for Ambient using Dynamic session

### Routing strategy
- For chain 'ambient': do NOT use local keystore. Require Dynamic session. Disable wallet_generate/import for ambient. wallet_list can show dynamic ambient session if authenticated. wallet_get_public_key/wallet_get_balance for ambient use dynamic session. sign/send for ambient use dynamic path.
- For other chains (solana/bsc/arbitrum): keep existing local keystore behavior unchanged.
- "also connect local wallet that handled current mcp tools" - confirms keep local wallets for non-ambient.

### New tools
Add to wallet tools:
- `wallet_sign_in_email` { email } -> sends OTP, returns verificationUUID
- `wallet_verify_email` { verificationUUID, code } -> verifies OTP, binds session key, stores session, returns wallet address
- `wallet_sign_out` -> clears session
- `wallet_status` -> returns { authenticated, address, chain: 'ambient', environmentId } when dynamic session active

Also need to handle tx signing/broadcasting for ambient via dynamic. Options:
1. Add `wallet_sign_tx_ambient` / `wallet_send_tx_ambient` that take unsignedTxBase64
2. Or extend existing `wallet_sign_transaction`/`wallet_send_transaction` to detect ambient and route to dynamic if no walletId or if using dynamic session
3. Or make walletId optional for ambient when using dynamic session

Req says "User can sign with wallet handled dynamic" and "broad cast tx with rpc directly". Existing tools require walletId. Need to support dynamic ambient without walletId. Add support: if chain is ambient and no walletId but dynamic session exists, use dynamic path.

### Implementation steps
1. Update .env.example with Dynamic env vars. Add to .env (create if not exists).
2. Add dependencies to package.json.
3. Create src/dynamic/session.ts - session persistence
4. Create src/dynamic/auth.ts - OTP + auth client
5. Create src/dynamic/ambient.ts - signing/broadcasting
6. Update src/tools/wallet.ts - add new tools, route ambient to dynamic
7. Update src/chains/solana.ts or add special handling - or create ambient-dynamic chain wallet
8. Update src/keystore/index.ts - prevent generate/import for ambient
9. Build and test

## Risks
- Dynamic SDK package names/versions need verification
- Session key binding must be done correctly per docs
- Need to handle JWT storage securely
- MCP server is stdio - session persists in file, fine
- Existing codebase patterns must be followed

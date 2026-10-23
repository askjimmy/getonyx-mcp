# Test Scenario: Dynamic Ambient Wallet with Local MCP

This document is for testing in a new session with the local MCP server. Use it as context.

## Prerequisites
- Built `dist/` exists (`npm run build` done)
- `.env` configured with the Dynamic vars
- Access to email for the OTP
- Node.js >= 20

## Environment Setup
Copy `.env.example` to `.env` and set:
```bash
DYNAMIC_ENVIRONMENT_ID=a9e7161d-c693-44be-8183-2c104ec7264e
DYNAMIC_SESSION_PATH=~/.config/wallet-mcp-server/dynamic-session.json
DYNAMIC_SESSION_PASSWORD=<a-long-random-secret>   # encrypts the session file at rest
AMBIENT_RPC_URL=https://rpc.ambient.xyz
AMBIENT_CHAIN_ID=mainnet-beta
# WALLET_PASSWORD=<backup password>                # only if the wallet is created with a backup
```

`DYNAMIC_AUTH_TOKEN` is **not** used: the server authenticates with the user's JWT, not with an
environment-wide API token.

## Test Flow

### 1. Check Status (Unauthenticated)
Tool: `wallet_status`
Expected: `{"authenticated": false}`

### 2. Send OTP
Tool: `wallet_sign_in_email`
Args: `{"email": "your-email@example.com"}`
Expected: `{"success": true, "verificationUUID": "...", "message": "OTP sent to email"}`

### 3. Verify OTP
Tool: `wallet_verify_email`
Args:
```json
{
  "email": "your-email@example.com",
  "verificationUUID": "<from step 2>",
  "code": "<6-digit code from email>"
}
```
Expected: `{"success": true, "address": "<ambient wallet address>", "chain": "ambient", "expiresAt": "...", "message": "Authenticated"}`
On the first sign-in a Dynamic Ambient wallet is created; later sign-ins reuse it.

### 4. Check Status (Authenticated)
Tool: `wallet_status`
Expected: `{"authenticated": true, "address": "...", "chain": "ambient", "environmentId": "...", "email": "...", "expiresAt": "..."}`

### 5. List Wallets (Should show Dynamic Ambient)
Tool: `wallet_list`
Expected: includes an entry with `walletId: "dynamic-ambient"`, `chain: "ambient"` and the session address

### 6. Get Public Key (Dynamic)
Tool: `wallet_get_public_key`
Args: `{}` or `{"walletId": "dynamic-ambient"}`
Expected: `{"walletId": "dynamic-ambient", "address": "...", "chain": "ambient", "source": "dynamic"}`

### 7. Get Balance (Dynamic)
Tool: `wallet_get_balance`
Args: `{}` or `{"walletId": "dynamic-ambient"}`
Expected: balance in AMB (human units, 9 decimals), token `AMB`

### 8. Sign Transaction (if you have an unsigned tx)
Tool: `wallet_sign_transaction`
Args:
```json
{
  "transaction": {
    "unsignedTxBase64": "<base64-encoded unsigned tx>"
  }
}
```
Expected: `{"chain": "ambient", "address": "...", "signature": "<base58>", "signedTx": "<base64>", "signed": true}`

The Ambient wallet must be the fee payer / signer of the transaction, otherwise signing fails
with "unknown signer".

### 9. Send Transaction (if you have an unsigned tx)
Tool: `wallet_send_transaction`
Args:
```json
{
  "transaction": {
    "unsignedTxBase64": "<base64-encoded unsigned tx>"
  }
}
```
Expected: `{"chain": "ambient", "address": "...", "signature": "<base58>", "txid": "<txid>", "signedTx": "<base64>"}`

### 10. Sign Out
Tool: `wallet_sign_out`
Expected: `{"success": true, "message": "Signed out"}` — the session file is deleted

### 11. Verify Signed Out
Tool: `wallet_status`
Expected: `{"authenticated": false}`

## Local Wallet Tests (Should Still Work)
### Generate Solana Wallet
Tool: `wallet_generate`
Args: `{"chain": "solana", "password": "testpass", "label": "test"}`
Expected: returns walletId and address

### Generate BSC Wallet
Tool: `wallet_generate`
Args: `{"chain": "bsc", "password": "testpass", "label": "test"}`
Expected: returns walletId and a `0x…` address

### Try Generate Ambient (Should Fail)
Tool: `wallet_generate`
Args: `{"chain": "ambient", "password": "testpass"}`
Expected: Error — "Invalid chain: ambient … Ambient is served by the Dynamic online wallet"

### List All Wallets
Tool: `wallet_list`
Expected: shows local wallets + the dynamic ambient entry if authenticated

## Notes
- The session is stored at `~/.config/wallet-mcp-server/dynamic-session.json` — encrypted when
  `DYNAMIC_SESSION_PASSWORD` is set, otherwise plaintext with `0600` permissions.
- The session holds the JWT, the P-256 session key and the Dynamic `walletMetadata`. The
  `externalServerKeySharesBackupInfo` inside the metadata is required for signing — never strip it.
- For signing you need a valid unsigned tx from the market server (or a hand-built one) whose fee
  payer is the Ambient wallet address.

## Known Issues to Watch For
- If the Ambient wallet was created in the dapp with a backup password, `WALLET_PASSWORD` must be
  set or signing fails with a password error.
- The first sign-in runs an MPC keygen ceremony — it can take a few seconds.
- The market-server builders return `transaction` (base64); pass it as `unsignedTxBase64`.

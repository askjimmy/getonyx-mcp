# Test Scenario: Dynamic Ambient Wallet with Local MCP

This document is for testing in a new session with local MCP server. Use it as context.

## Prerequisites
- Built dist/ exists (`npm run build` done)
- `.env` configured with Dynamic vars
- `DYNAMIC_AUTH_TOKEN` set (server token from Dynamic console)
- Access to email for OTP

## Environment Setup
Copy `.env.example` to `.env` and set:
```bash
DYNAMIC_ENVIRONMENT_ID=a9e7161d-c693-44be-8183-2c104ec7264e
DYNAMIC_AUTH_TOKEN=<your-server-token>
AMBIENT_RPC_URL=https://rpc.ambient.xyz
DYNAMIC_SESSION_PATH=~/.config/wallet-mcp-server/dynamic-session.json
```

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
Expected: `{"success": true, "address": "...", "chain": "ambient", "message": "Authenticated"}`

### 4. Check Status (Authenticated)
Tool: `wallet_status`
Expected: `{"authenticated": true, "address": "...", "chain": "ambient", "environmentId": "...", "email": "..."}`

### 5. List Wallets (Should show Dynamic Ambient)
Tool: `wallet_list`
Expected: includes entry with `walletId: "dynamic-ambient"`, `chain: "ambient"`, address from session

### 6. Get Public Key (Dynamic)
Tool: `wallet_get_public_key`
Args: `{}` or `{"walletId": "dynamic-ambient"}`
Expected: returns address with `source: "dynamic"` or just address

### 7. Get Balance (Dynamic)
Tool: `wallet_get_balance`
Args: `{}` or `{"walletId": "dynamic-ambient"}`
Expected: balance in lamports as string, token AMB

### 8. Sign Transaction (if have unsigned tx)
Tool: `wallet_sign_transaction`
Args:
```json
{
  "transaction": {
    "unsignedTxBase64": "<base64-encoded unsigned tx>"
  }
}
```
Expected: returns signature

### 9. Send Transaction (if have unsigned tx)
Tool: `wallet_send_transaction`
Args:
```json
{
  "transaction": {
    "unsignedTxBase64": "<base64-encoded unsigned tx>"
  }
}
```
Expected: returns `{signature, txid}`

### 10. Sign Out
Tool: `wallet_sign_out`
Expected: `{"success": true, "message": "Signed out"}`

### 11. Verify Signed Out
Tool: `wallet_status`
Expected: `{"authenticated": false}`

## Local Wallet Tests (Should Still Work)
### Generate Solana Wallet
Tool: `wallet_generate`
Args: `{"chain": "solana", "password": "testpass", "label": "test"}`
Expected: returns walletId and address

### Try Generate Ambient (Should Fail)
Tool: `wallet_generate`
Args: `{"chain": "ambient", "password": "testpass"}`
Expected: Error - "Ambient wallet uses Dynamic online wallet..."

### List All Wallets
Tool: `wallet_list`
Expected: shows local wallets + dynamic ambient if authenticated

## Notes
- Session stored at `~/.config/wallet-mcp-server/dynamic-session.json` (plaintext currently)
- For signing, need valid unsigned tx from mcp-server or constructed manually
- `DYNAMIC_AUTH_TOKEN` required for `getAuthenticatedClient()`
- Build is in `dist/` - MCP will use built files

## Known Issues to Watch For
- If wallet metadata extraction fails, address may be empty
- SDK API differences may cause signing to fail
- JWT stored unencrypted (dev only)

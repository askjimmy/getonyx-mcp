# Remove local (keystore) wallet support for Ambient

## Context
Ambient wallets are Dynamic-only (online). The codebase already excludes `ambient` from `ChainId` and local keystore generation/import. However, legacy keystore files may still contain entries with `chain: "ambient"` created before that change, and `listWalletEntries`/`getWalletEntry` do not filter them out, so they still surface in `wallet_list` and can be addressed by id. This causes the "two Ambient wallets" confusion.

## Goal
Ensure Ambient exists only as the Dynamic online wallet (`dynamic-ambient`). No keystore entry with `chain: "ambient"` is listed, addressable, or usable.

## Decisions
- Keep Dynamic wallet as the sole Ambient wallet.
- Treat any keystore entry whose chain is not a valid `ChainId` (including legacy `ambient`) as invalid/ignored.
- On load, drop legacy ambient entries from the keystore (migration), logging nothing.

## Tasks
1. `src/keystore/index.ts` — `listWalletEntries`: filter out entries whose `chain` is not in `listChainIds()`.
2. `src/keystore/index.ts` — `getWalletEntry`: throw `Wallet not found` if entry chain is not a valid `ChainId`.
3. `src/keystore/index.ts` — `loadRaw` (or a migration helper): remove entries with invalid chain before returning; persist cleanup on next save.
4. `src/tools/wallet.ts` — `handleList`: only append Dynamic session for ambient; never show keystore ambient entries (covered by filter, but verify).
5. `src/tools/wallet.ts` — `assertLocalWalletId`: also reject entries whose chain is not a valid local chain.
6. Update tool descriptions that still mention ambient in local-chain contexts (already mostly done); ensure `wallet_generate`/`wallet_import` reject ambient explicitly.
7. Add/adjust tests if any exist for keystore filtering.

## Risks
- Existing users with a legacy ambient keystore entry lose access to that private key via this server. Acceptable per requirement (remove local ambient wallet). Document in release notes.
- Migration must not corrupt keystore; use atomic write (already in place).

## Validation
- `wallet_list` returns only Dynamic Ambient + local chains.
- `wallet_get_public_key`/`sign_transaction` with legacy ambient id errors cleanly.
- Typecheck and lint pass.

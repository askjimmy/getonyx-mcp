# GetOnyx MCP — Wallet Server

Multi-chain wallet management for AI agents over the [Model Context Protocol](https://modelcontextprotocol.io).

This repository contains the **signing half** of the GetOnyx MCP stack. It pairs with the
publicly deployed **GetOnyx market server**, which answers market/trading/bridge questions and
builds *unsigned* transactions.

| Server | Transport | What it does | Holds private keys? |
| --- | --- | --- | --- |
| **GetOnyx** (market server) | Remote HTTP — `https://getonyx-mcp-130077224278.europe-west1.run.app/mcp` | Market data, orderbooks, prices, balances, bridge quotes, and **unsigned** transaction builders | No |
| **Wallet** (this repo) | Local stdio | Key generation/import, message & transaction **signing**, broadcasting, balance queries | Yes — encrypted on disk |

The split is deliberate: the market server is stateless, public and safe to expose over the
internet, while private keys never leave your machine. The agent asks the market server for an
unsigned transaction, hands it to the wallet server for signing, and then asks the wallet server
to broadcast it.

```
        ┌───────────────────────────┐                ┌───────────────────────────┐
        │  GetOnyx market server    │                │  Wallet MCP (this repo)   │
        │  remote · HTTP Streamable │                │  local · stdio            │
        │                           │                │                           │
        │  get_market, get_orderbook│  unsigned tx   │  wallet_sign_transaction   │
        │  build_swap_tx, …         │ ─────────────► │  wallet_send_transaction   │
        │  quote_bridge, …          │   (base64)     │  wallet_generate / import  │
        └───────────────────────────┘                └───────────────────────────┘
                    ▲                                              ▲
                    │  21 market/trading/bridge tools              │  10 wallet tools
                    └───────────── AI agent (Kilo, Claude, …) ────┘
```

---

## Table of contents

- [What you can do](#what-you-can-do)
- [Quick start](#quick-start)
- [Connecting to your AI client](#connecting-to-your-ai-client)
- [The end-to-end workflow](#the-end-to-end-workflow)
- [Tool reference — GetOnyx market server](#tool-reference--getonyx-market-server)
- [Tool reference — Wallet server](#tool-reference--wallet-server)
- [Supported chains](#supported-chains)
- [Security model](#security-model)
- [Configuration](#configuration)
- [Docker](#docker)
- [Development](#development)
- [License](#license)

---

## What you can do

With both servers registered, an agent can do all of the following from a single conversation:

### Query markets
- List every Manifest market on-chain (`list_markets`) and every supported trading pair with token
  metadata (`get_pools`).
- Inspect a market: base/quote mints, decimals, best bid/ask, full orderbook (`get_market`,
  `get_orderbook`, `get_best_prices`).
- Look up open orders and recent fills (`get_fills`).
- Check tradable and withdrawable balances on a market (`get_balance`) and global (cross-market)
  balances for a mint (`get_global_balance`).

### Swap
- Build a swap transaction for any market, exact-in or exact-out, base-in or quote-in
  (`build_swap_tx`), then sign and broadcast it locally.
- Quote the best bid/ask before swapping, and set an explicit minimum output amount to protect
  against slippage.

### Provide liquidity
- Deposit tokens into a market wrapper to back your maker orders (`build_deposit_tx`).
- Place maker orders with `PostOnly` / `Limit` / `Global` order types, and reverse orders with an
  explicit spread in bps (`build_place_order_tx`, `build_batch_update_tx`).
- Withdraw from the market whenever you want (`build_withdraw_tx`, `build_withdraw_all_tx`).
- Batch place and cancel many orders in a single transaction to save fees
  (`build_batch_update_tx`).

### Bridge
- Quote bridge fees and expected amounts for any supported route (`quote_bridge`).
- Build inbound bridges (Ethereum / Arbitrum / BSC / Solana → Ambient via the BSC clearinghouse),
  outbound bridges (Ambient → destination chain) and direct BSC ↔ Ambient Hyperlane warp routes
  (`build_inbound_bridge_tx`, `build_outbound_bridge_tx`, `build_direct_bridge_tx`).
- Read the bridge configuration (EIDs, addresses, decimals) for a chain (`get_bridge_config`).

### Manage keys
- Generate a new keypair per chain, or import an existing private key (`wallet_generate`,
  `wallet_import`).
- Sign arbitrary messages (`wallet_sign_message`) and transactions (`wallet_sign_transaction`),
  or sign and broadcast in one step (`wallet_send_transaction`).
- Query native balances (`wallet_get_balance`), list wallets (`wallet_list`), export or delete a
  key (`wallet_export`, `wallet_delete`).

---

## Quick start

Requirements: **Node.js >= 18** and npm.

```bash
git clone https://github.com/askjimmy/getonyx-mcp.git
cd getonyx-mcp
npm install
npm run build
```

The wallet server speaks **stdio** — it is launched as a child process by your MCP client. You
can smoke-test it manually:

```bash
npm start
# Wallet MCP Server started on stdio
```

Verify the deployed market server is reachable:

```bash
curl -s -X POST https://getonyx-mcp-130077224278.europe-west1.run.app/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}'
```

---

## Connecting to your AI client

Register **both** servers. The market server is remote, the wallet server is a local command.

### Kilo

```bash
kilo mcp add getonyx --url https://getonyx-mcp-130077224278.europe-west1.run.app/mcp
kilo mcp add wallet --command "node /absolute/path/to/getonyx-mcp/dist/index.js"
```

Or in `kilo.json` / `.kilo/config.json`:

```json
{
  "mcpServers": {
    "getonyx": {
      "url": "https://getonyx-mcp-130077224278.europe-west1.run.app/mcp"
    },
    "wallet": {
      "command": "node",
      "args": ["/absolute/path/to/getonyx-mcp/dist/index.js"]
    }
  }
}
```

### Claude Desktop

`claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "getonyx": {
      "url": "https://getonyx-mcp-130077224278.europe-west1.run.app/mcp"
    },
    "wallet": {
      "command": "node",
      "args": ["/absolute/path/to/getonyx-mcp/dist/index.js"]
    }
  }
}
```

### Cursor

Settings → Features → MCP → Add server, or `.cursor/settings.json`:

```json
{
  "mcpServers": {
    "getonyx": {
      "url": "https://getonyx-mcp-130077224278.europe-west1.run.app/mcp"
    },
    "wallet": {
      "command": "node",
      "args": ["/absolute/path/to/getonyx-mcp/dist/index.js"]
    }
  }
}
```

### ChatGPT

Settings → Deep Research & Agents → MCP → Add. The deployed market server can be added by URL;
the wallet server must be added as a local command pointing at `dist/index.js`.

### Any MCP client (raw JSON-RPC)

The market server is a stateless Streamable HTTP endpoint — one `POST` per call, no session
required:

```bash
curl -s -X POST https://getonyx-mcp-130077224278.europe-west1.run.app/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_pools","arguments":{}}}'
```

---

## The end-to-end workflow

Every transaction follows the same three steps: **query → build → sign → broadcast**.

### 1. Query

```
You: "What's the best bid/ask on the wAMB/USDT market?"
```

```
getonyx → get_pools                              # find the market address
getonyx → get_best_prices { marketAddress }       # { bestBidPrice, bestAskPrice, spread }
```

### 2. Build the unsigned transaction

```
You: "Swap 1 USDT for wAMB on that market."
```

```
getonyx → build_swap_tx {
  marketAddress, payer,
  inAtoms: 1000000000,      # 1 USDT (9 decimals → atoms)
  outAtoms: 900000000,      # minimum acceptable output
  isBaseIn: false,          # quote token in
  isExactIn: true
}
# → { transaction: "<base64>", chain: "solana", instructions: [...] }
```

### 3. Sign and broadcast locally

```
You: "Sign it with my Ambient wallet and send it."
```

```
wallet → wallet_list { chain: "ambient" }                 # find the walletId
wallet → wallet_send_transaction {
  walletId, password,
  transaction: { serialized: "<base64 from step 2>" }
}
# → { hash: "5Ujj..." }
```

The market server never sees a private key; the wallet server never talks to the market server.

### End-to-end prompt examples

- *"List the supported trading pairs and show me the top of book for each."*
- *"Swap 25 USDT into wAMB at a minimum of 24.8 wAMB and send it from my Ambient wallet."*
- *"Post 500 wAMB as a bid at 0.98 USDT, post-only, and tell me the order id."*
- *"Deposit 100 USDT into the wAMB/USDT market and place a maker order for 50 wAMB at 1.02."*
- *"How much does it cost to bridge 100 USDT from Arbitrum to Ambient, and build the transaction."*
- *"Withdraw all my USDT from the wAMB/USDT market and cancel every open order."*
- *"Show my balances on the wAMB/USDT market and my native AMB balance."*

---

## Tool reference — GetOnyx market server

21 tools, all exposed by the remote server at
`https://getonyx-mcp-130077224278.europe-west1.run.app/mcp`.

### Market

| Tool | Description | Key args |
| --- | --- | --- |
| `list_markets` | List all Manifest markets on-chain (heavy RPC call) | — |
| `get_pools` | List known trading pairs with token metadata (symbol, name, decimals, icon) | — |
| `get_market` | Market details: mints, decimals, best prices, orders | `marketAddress` |
| `get_orderbook` | Full orderbook (bids and asks) | `marketAddress` |
| `get_best_prices` | Best bid/ask and spread | `marketAddress` |
| `get_fills` | Recent fills / open orders | `marketAddress`, `limit` |
| `get_balance` | Tradable and withdrawable balances of a trader on a market | `marketAddress`, `trader` |

### Trading

| Tool | Description | Key args |
| --- | --- | --- |
| `build_place_order_tx` | Unsigned tx placing an order | `marketAddress`, `payer`, `numBaseTokens`, `tokenPrice`, `isBid`, `orderType` |
| `build_cancel_order_tx` | Unsigned tx cancelling one order | `marketAddress`, `payer`, `clientOrderId` |
| `build_cancel_all_tx` | Unsigned tx cancelling every order on a market | `marketAddress`, `payer` |
| `build_batch_update_tx` | Unsigned tx placing and/or cancelling many orders at once | `marketAddress`, `payer`, `placeParams[]`, `cancelParams[]`, `cancelAll` |
| `build_swap_tx` | Unsigned swap transaction | `marketAddress`, `payer`, `inAtoms`, `outAtoms`, `isBaseIn`, `isExactIn` |

Order types: `Limit`, `ImmediateOrCancel`, `PostOnly`, `Global`, `Reverse`, `ReverseTight`.
`Reverse` / `ReverseTight` take `spreadBps`; the others take `lastValidSlot`.

### Account

| Tool | Description | Key args |
| --- | --- | --- |
| `build_deposit_tx` | Unsigned tx depositing tokens into a market wrapper | `marketAddress`, `payer`, `mint`, `amountTokens` |
| `build_withdraw_tx` | Unsigned tx withdrawing tokens from a market wrapper | `marketAddress`, `payer`, `mint`, `amountTokens` |
| `build_withdraw_all_tx` | Unsigned tx withdrawing every balance from a market wrapper | `marketAddress`, `payer` |
| `get_global_balance` | Global (cross-market) balance of a mint for a trader | `marketAddress`, `trader`, `mint` |

### Bridge

| Tool | Description | Key args |
| --- | --- | --- |
| `quote_bridge` | Bridge fees and expected amounts | `route` (`inbound`/`outbound`/`direct`), `params` |
| `build_inbound_bridge_tx` | Unsigned inbound bridge (source chain → Ambient) | `sourceChain`, `amount`, `recipientAddress` |
| `build_outbound_bridge_tx` | Unsigned outbound bridge (Ambient → destination chain) | `destinationChain`, `amount`, `recipientAddress`, `payer` |
| `build_direct_bridge_tx` | Unsigned direct BSC ↔ Ambient Hyperlane warp bridge | `direction`, `amount`, `recipientAddress` |
| `get_bridge_config` | Bridge configuration (EIDs, addresses, decimals) for a chain | `chain` |

Bridge chains: `ethereum`, `arbitrum`, `bsc`, `solana`, `ambient`.

---

## Tool reference — Wallet server

10 tools, exposed by this repository over stdio.

| Tool | Description | Params |
| --- | --- | --- |
| `wallet_generate` | Create a new keypair, encrypt it, store it in the keystore | `chain`, `password`, `label?` |
| `wallet_import` | Import an existing private key, encrypt it, store it | `chain`, `privateKey`, `password`, `label?` |
| `wallet_export` | Decrypt and export a stored private key | `walletId`, `password` |
| `wallet_get_public_key` | Public key / address of a stored wallet (no password) | `walletId` |
| `wallet_sign_message` | Sign an arbitrary UTF-8 message | `walletId`, `password`, `message` |
| `wallet_sign_transaction` | Sign a transaction **without** broadcasting | `walletId`, `password`, `transaction` |
| `wallet_send_transaction` | Sign **and broadcast** a transaction | `walletId`, `password`, `transaction` |
| `wallet_list` | List stored wallets (addresses and metadata only) | `chain?` |
| `wallet_delete` | Delete a wallet (password proves ownership) | `walletId`, `password` |
| `wallet_get_balance` | Native token balance of a stored wallet (AMB on Ambient, SOL on Solana, BNB on BSC, ETH on Arbitrum) | `walletId` |

### Transaction input formats

**EVM** (BSC, Arbitrum) — standard JSON-RPC fields; missing `gasLimit`, `nonce`, fees and
`chainId` are filled in from the RPC provider:

```json
{ "to": "0x…", "value": "1000000000000000000", "data": "0x…", "chainId": 56 }
```

**SVM** (Ambient, Solana) — a base64-encoded serialized Solana transaction, exactly as returned by
the market server's `build_*` tools:

```json
{ "serialized": "AQAB...==" }
```

### Private key formats accepted by `wallet_import`

| Chain | Accepted formats |
| --- | --- |
| Ambient, Solana | base58 64-byte secret key, base58 32-byte seed, hex secret key/seed, or a JSON array of 64 byte values |
| BSC, Arbitrum | `0x`-prefixed 32-byte hex private key |

---

## Supported chains

| Chain id | Type | Native token | Decimals | Chain id (EVM) | RPC (override with env var) |
| --- | --- | --- | --- | --- | --- |
| `ambient` | SVM | AMB (wrapped: wAMB) | 9 | — | `https://rpc.ambient.xyz` |
| `solana` | SVM | SOL | 9 | — | `https://api.mainnet-beta.solana.com` |
| `bsc` | EVM | BNB | 18 | 56 | `https://bsc-dataseed.binance.org/` |
| `arbitrum` | EVM | ETH | 18 | 42161 | `https://arb1.arbitrum.io/rpc` |

Ambient is an SVM chain, but its native token is **AMB** — not SOL. AMB is the gas/native asset
held in a wallet, while **wAMB** is the wrapped form used as the base token of Ambient markets
(for example the wAMB/USDT pair). `wallet_get_balance` reports the balance in AMB and also returns
`wrappedToken: "wAMB"` for the Ambient chain, so an agent knows which symbol to use when it
interacts with a market.

Amounts in the market-server tools are expressed in **atoms** (base units) — for the Ambient
wAMB/USDT pair that is 9 decimals (`1 USDT = 1_000_000_000` atoms). The wallet tools use plain
token units and decimal strings.

---

## Security model

- **Keystore**: `~/.config/wallet-mcp-server/keystore.json`. Private keys are encrypted at rest
  with **AES-256-GCM** using a **PBKDF2-SHA256** key (100 000 iterations, 16-byte salt, 12-byte
  IV). The wire format of an encrypted entry is base64 of `[salt][iv][ciphertext+tag]`.
- **Passwords are never stored.** You must pass the password on every `wallet_export`,
  `wallet_sign_*`, `wallet_send_transaction` and `wallet_delete` call.
- **Keys are decrypted in memory only** for the duration of a single operation and discarded
  immediately afterwards.
- **Listing never leaks secrets.** `wallet_list` and `wallet_get_balance` return addresses and
  metadata only.
- **The wallet server is local-only.** It speaks stdio and is spawned by your MCP client; it is
  never exposed over the network. Do not deploy it with an HTTP transport.
- **The market server holds no keys.** It only returns unsigned transactions and public market
  data, and sets no authentication — put it behind a trusted proxy if you need to restrict access.
- **Use a dedicated wallet.** Add a label per wallet (`label` parameter) and keep small balances in
  agent-accessible wallets.

---

## Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `WALLET_KEYSTORE_PATH` | `~/.config/wallet-mcp-server/keystore.json` | Keystore file location |
| `AMBIENT_RPC_URL` | `https://rpc.ambient.xyz` | Ambient RPC endpoint |
| `SOLANA_RPC_URL` | `https://api.mainnet-beta.solana.com` | Solana RPC endpoint |
| `BSC_RPC_URL` | `https://bsc-dataseed.binance.org/` | BSC RPC endpoint |
| `ARBITRUM_RPC_URL` | `https://arb1.arbitrum.io/rpc` | Arbitrum One RPC endpoint |

Example — point the wallet server at a private RPC and a custom keystore:

```json
{
  "mcpServers": {
    "wallet": {
      "command": "node",
      "args": ["/absolute/path/to/getonyx-mcp/dist/index.js"],
      "env": {
        "AMBIENT_RPC_URL": "https://your-private-rpc.example",
        "WALLET_KEYSTORE_PATH": "/absolute/path/to/keystore.json"
      }
    }
  }
}
```

---

## Docker

The image builds from the repository root (no external SDK dependency):

```bash
docker build -t getonyx-mcp .
```

Run it with the keystore mounted so wallets persist across containers:

```bash
docker run --rm -i \
  -v "$HOME/.config/wallet-mcp-server:/home/waluser/.config/wallet-mcp-server" \
  getonyx-mcp
```

The image runs as a non-root user (`waluser`) and defaults
`WALLET_KEYSTORE_PATH=/home/waluser/.config/wallet-mcp-server/keystore.json`.

To use the container from an MCP client, register the container command instead of `node`:

```json
{
  "mcpServers": {
    "wallet": {
      "command": "docker",
      "args": [
        "run", "--rm", "-i",
        "-v", "/home/you/.config/wallet-mcp-server:/home/waluser/.config/wallet-mcp-server",
        "getonyx-mcp"
      ]
    }
  }
}
```

---

## Development

```bash
npm install
npm run build        # tsc → dist/
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm run dev          # tsx watch src/index.ts
```

Layout:

```
src/
├── index.ts            # entry point (stdio)
├── server.ts           # MCP server bootstrap
├── tools/
│   ├── index.ts        # tool registry
│   └── wallet.ts       # the 10 wallet tools
├── keystore/
│   ├── index.ts        # keystore manager (load/save/generate/import)
│   ├── crypto.ts       # PBKDF2 + AES-256-GCM
│   └── types.ts
└── chains/
    ├── index.ts        # chain registry
    ├── solana.ts       # SVM implementation (@solana/web3.js)
    ├── evm.ts          # EVM implementation (ethers v6)
    └── types.ts
```

The market-server half of the stack lives in a separate repository and is deployed to Cloud Run;
this repository only needs the public URL to work.

---

## License

MIT

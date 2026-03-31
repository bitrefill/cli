[![NPM package](https://img.shields.io/npm/v/@bitrefill/cli.svg?style=flat-square)](https://www.npmjs.com/package/@bitrefill/cli)

# @bitrefill/cli

Browse, buy, and manage gift cards, mobile top-ups, and eSIMs from the command line.

The CLI connects to the [Bitrefill MCP server](https://api.bitrefill.com/mcp) and dynamically discovers available tools, exposing each as a subcommand with typed options.

## Install

```bash
npm install -g @bitrefill/cli
```

## Quick start (`init`)

The fastest way to set up the CLI:

```bash
bitrefill init
```

This walks you through a one-time setup:

1. Prompts for your API key (masked input) -- get one at [bitrefill.com/account/developers](https://www.bitrefill.com/account/developers)
2. Validates the key against the Bitrefill MCP server
3. Stores the key in `~/.config/bitrefill-cli/credentials.json` (permissions `0600`)
4. If [OpenClaw](https://github.com/openclaw/openclaw) is detected, registers Bitrefill as an MCP server and generates a `SKILL.md` for agents

Non-interactive and agent-driven usage:

```bash
# Pass the key directly (scripts, CI, OpenClaw agents)
bitrefill init --api-key YOUR_API_KEY --non-interactive

# Or via environment variable
export BITREFILL_API_KEY=YOUR_API_KEY
bitrefill init --non-interactive

# Force OpenClaw integration even if not auto-detected
bitrefill init --openclaw
```

After `init`, the stored key is picked up automatically -- no need to pass `--api-key` on every invocation.

### OpenClaw + Telegram

If you use [OpenClaw](https://github.com/openclaw/openclaw) as your AI agent gateway (e.g. via Telegram), `bitrefill init` does extra work:

- Writes `BITREFILL_API_KEY` to `~/.openclaw/.env` (read by the gateway at activation)
- Adds an MCP server entry to `~/.openclaw/openclaw.json` using `${BITREFILL_API_KEY}` -- the config file never contains the actual key
- Generates `~/.openclaw/skills/bitrefill/SKILL.md` so the agent knows about all available tools

After init, tell your Telegram bot: *"Search for Netflix gift cards on Bitrefill"*.

## Authentication

### API Key (recommended)

Generate an API key at [bitrefill.com/account/developers](https://www.bitrefill.com/account/developers). After running `bitrefill init`, the key is stored locally and used automatically.

You can also pass it explicitly:

```bash
# Flag
bitrefill --api-key YOUR_API_KEY search-products --query "Netflix"

# Environment variable
export BITREFILL_API_KEY=YOUR_API_KEY
bitrefill search-products --query "Netflix"
```

Key resolution priority: `--api-key` flag > `BITREFILL_API_KEY` env var > stored credentials file.

### OAuth

On first run without an API key, the CLI opens your browser for OAuth authorization. Credentials are stored in `~/.config/bitrefill-cli/`.

### Non-interactive / CI

In environments without a TTY (e.g. CI, Docker, scripts), or when `CI=true`, the CLI cannot complete browser-based OAuth. Use `bitrefill init` first, or pass `--api-key` / `BITREFILL_API_KEY`.

Node does not load `.env` files automatically. After editing `.env`, either export variables in your shell (`set -a && source .env && set +a` in bash/zsh) or pass `--api-key` on the command line.

## Usage

```bash
bitrefill [--api-key <key>] [--json] [--no-interactive] <command> [options]
```

### Human-readable output (default)

Tool results are pretty-printed JSON on stdout. Status messages (OAuth prompts, etc.) also go to stdout.

### Machine-readable output (`--json`)

Pass `--json` anywhere before the subcommand so scripts and `jq` get a single JSON value per invocation on stdout:

- **stdout**: Only the tool result (JSON). Text payloads from the server may be JSON or [TOON](https://toonformat.dev/); the CLI decodes TOON to JSON when needed.
- **stderr**: Progress messages, errors, and client errors (JSON `{ "error": "..." }` for failures).

Example:

```bash
bitrefill --json search-products --query "Amazon" --per_page 1 | jq '.products[0].name'
```

### LLM context (`llm-context`)

Generates Markdown from the MCP `tools/list` response: tool names, descriptions, parameter tables, JSON Schema, example `bitrefill …` invocations, and example MCP `tools/call` payloads. Intended for **CLAUDE.md**, **Cursor** rules, or **`.github/copilot-instructions.md`**.

- **stdout** by default, or **`-o` / `--output <file>`** to write a file.
- Uses the same auth as other commands (`--api-key`, `BITREFILL_API_KEY`, or OAuth).
- The generated **Connection** line shows a redacted MCP URL (`…/mcp/<API_KEY>`), not your real key.

```bash
export BITREFILL_API_KEY=YOUR_API_KEY
bitrefill llm-context -o BITREFILL-MCP.md
# or: bitrefill llm-context > BITREFILL-MCP.md
```

### Examples

```bash
# First-time setup
bitrefill init

# Search for products
bitrefill search-products --query "Netflix"

# Get product details
bitrefill get-product-details --product_id "steam-usa" --currency USDC

# Buy a product
bitrefill buy-products --cart_items '{"product_id": "steam-usa", "package_id": 10}' --payment_method usdc_base

# List your orders
bitrefill list-orders

# List available commands
bitrefill --help

# Clear stored credentials
bitrefill logout

# Export tool docs for coding agents (see "LLM context" above)
bitrefill llm-context -o BITREFILL-MCP.md
```

## Development

From the repository root (requires [pnpm](https://pnpm.io/)):

```bash
pnpm install
pnpm format    # Prettier check
pnpm test      # Vitest unit tests
pnpm build     # Compile to dist/
pnpm dev -- --help   # Run CLI via tsx without building
```

Publishing to npm is triggered by [GitHub Releases](https://github.com/bitrefill/cli/releases); see [.github/RELEASING.md](.github/RELEASING.md).

## Paying

**Flow:** `get-product-details` → pick `product_id` + `package_id` → `buy-products` with `--cart_items` and `--payment_method`.

### Payment methods

| Method | Chain / asset | Response fields (raw) |
|--------|----------------|----------------------|
| `bitcoin` | Bitcoin (SegWit) | `address`, `BIP21`, `lightningInvoice`, `satoshiPrice` |
| `lightning` | Lightning | `lightningInvoice`, `satoshiPrice` |
| `ethereum` | Ethereum mainnet, native ETH | `address`, `paymentUri` / `BIP21`, `altcoinPrice` (ETH) |
| `eth_base` | Base, native ETH | `address`, `paymentUri` (@8453) |
| `usdc_base` | Base (8453) | `address`, `paymentUri`, `contractAddress` (USDC) |
| `usdc_arbitrum` | Arbitrum (42161) | `address`, `paymentUri`, `contractAddress` |
| `usdc_polygon` | Polygon (137) | `address`, `paymentUri`, `contractAddress` |
| `usdc_erc20` | Ethereum (1) | `address`, `paymentUri`, `contractAddress` |
| `usdc_solana` | Solana | `address` (base58), `contractAddress` (USDC SPL) |
| `usdt_polygon`, `usdt_erc20` | Same as USDC, USDT | Same shape |
| `balance` | Bitrefill account credit | No address; invoice created and paid from balance |

### Response mode

- **`--return_payment_link false`**: response includes **address**, **amount**, **BIP21** / **paymentUri** (and for Bitcoin, also **lightningInvoice**). Use for wallet pay.
- **`--return_payment_link true`** (default): response includes **payment_link** (browser checkout) and **x402_payment_url** for programmatic pay.

### x402

[x402](https://docs.x402.org/) = HTTP 402 + `payment-required` header (Base64 JSON: amount, `payTo`, accepted networks, timeout). GET `x402_payment_url` → 402 + instructions → send crypto → resubmit with payment proof. For agents/tools; humans use **payment_link**.

**Check status:** `get-invoice-by-id --invoice_id <id>`.

## Legal

- [Terms of Service](https://www.bitrefill.com/terms)
- [Privacy Policy](https://www.bitrefill.com/privacy)

[![NPM package](https://img.shields.io/npm/v/@bitrefill/cli.svg?style=flat-square)](https://www.npmjs.com/package/@bitrefill/cli)

# @bitrefill/cli

Browse, buy, and manage gift cards, mobile top-ups, and eSIMs from the command line.

The CLI connects to the [Bitrefill MCP server](https://api.bitrefill.com/mcp) and dynamically discovers available tools, exposing each as a subcommand with typed options.

## Install

```bash
npm install -g @bitrefill/cli
```

## Usage

```bash
bitrefill <command> [options]
```

On first run, the CLI will open your browser for OAuth authorization. Credentials are stored in `~/.config/bitrefill-cli/`.

### Examples

```bash
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
```

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

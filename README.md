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

## Legal

- [Terms of Service](https://www.bitrefill.com/terms)
- [Privacy Policy](https://www.bitrefill.com/privacy)

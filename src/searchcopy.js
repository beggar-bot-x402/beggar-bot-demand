// Search-friendly copy for the routes that match proven x402 buyer demand (see docs SPARE_COMPUTE_2026-11-16).
// Plain "<thing> API: give X, get Y" wording that agents' discovery queries actually use ("token price", "wallet balance",
// "gas price", "ens resolve", "decode transaction"...). Overrides description + prepends tags in DISCOVERY (402 + Bazaar),
// the catalog (openapi / llms.txt / .well-known) and MCP tool descriptions. Behaviour and price are unchanged.
const PAYNOTE = " Payment settles only after a successful (2xx) response; input errors are never charged.";
export const SEARCH_COPY = {
  "/v1/tokenprice": { d: "Crypto token price API for AI agents: give up to 4 token symbols (ETH, BTC, USDC, AERO, DEGEN, cbBTC, VIRTUAL…) or contract addresses on Base or Ethereum, get the live USD price read from on-chain DEX pools (Uniswap v3, Aerodrome) with pool liquidity, cross-pool spread and a confidence flag. No API key.", t: ["token price", "crypto price", "usd price", "price api", "eth price"] },
  "/v1/portfolio": { d: "Wallet balance and portfolio API for AI agents: give a Base wallet address, get native ETH plus balances of 24 top Base tokens (USDC, USDT, DAI, WETH, cbBTC, AERO, VIRTUAL…) and any extra tokens you list, each priced in USD on-chain, with total portfolio value and account type.", t: ["wallet balance", "portfolio", "token balances", "holdings", "net worth"] },
  "/v1/erc20balances": { d: "Token balance API: give up to 25 wallet addresses and up to 25 ERC-20 token contracts, get every balance (USDC, USDT or any token) plus native balance, with symbol, decimals, formatted amounts and per-token totals in one call. Multi-chain EVM, keyless.", t: ["erc20 balance", "token balance", "wallet balance", "usdc balance", "batch"] },
  "/v1/nativebalances": { d: "Native balance API (gas balance check): give up to 10 wallet addresses, get ETH/POL balance, USD value, tx count and active chains across Ethereum, Base, Optimism, Arbitrum and Polygon in one call. Check gas before sending.", t: ["eth balance", "native balance", "gas balance", "wallet balance", "multichain"] },
  "/v1/fetch": { d: "Web page fetch API for AI agents: give any public URL, get the page as clean readable markdown with title, links and publish date — read articles, docs and web pages without a browser. SSRF-safe, honours robots.txt, 1 MB / 8 s caps.", t: ["web fetch", "url to markdown", "scrape", "read webpage", "web content"] },
  "/v1/gasfee": { d: "Gas price API for Base, Ethereum, Optimism, Arbitrum and Polygon: current gas price in gwei, next base fee, slow/standard/fast EIP-1559 maxFeePerGas + priority fee, congestion and trend, and the USD cost of a transfer, USDC payment, swap or approve before you send a transaction.", t: ["gas price", "gas fee", "gwei", "transaction cost", "eip-1559"] },
  "/v1/perpfunding": { d: "Perpetual futures funding rate API (Hyperliquid): hourly and APR funding rates, open interest, premium, 24h volume and change, long/short bias for BTC, ETH, SOL and every listed perp; filter by coins, sort by OI, funding, negative funding or volume.", t: ["funding rate", "perpetual futures", "perps", "open interest", "hyperliquid"] },
  "/v1/txsummary": { d: "Transaction decoder / explainer API: give a transaction hash on Base, Ethereum, Optimism, Arbitrum or Polygon, get status, decoded method, fee, every ERC-20/NFT transfer and approval, net token flows per address and a one-line plain-English headline.", t: ["decode transaction", "transaction explainer", "tx lookup", "token transfers", "tx hash"] },
  "/v1/txstatus": { d: "Transaction status API — did my transaction or payment land? Give a tx hash on Base, Ethereum, Optimism, Arbitrum or Polygon, get success / reverted / pending / replaced / not found, confirmations, fee paid and whether it is final; or give an address to detect a stuck transaction.", t: ["transaction status", "tx status", "confirmations", "payment landed", "stuck transaction"] },
  "/v1/tokeninfo": { d: "Token info / metadata API: give up to 20 ERC-20 contract addresses, get name, symbol, decimals, total supply, optional holder balance and spam / impersonation / clone flags with an ok|review|suspicious verdict. Base default; other EVM chains.", t: ["token info", "token metadata", "erc20 info", "token safety", "contract lookup"] },
  "/v1/ens": { d: "ENS resolver API: resolve a .eth name (vitalik.eth) to its address, or an address to its verified primary ENS name, with owner, resolver, url and contenthash records plus homoglyph / zero-width spoofing flags.", t: ["ens resolve", "ens lookup", "reverse ens", "name to address", "eth name"] },
  "/v1/basename": { d: "Basenames resolver API (Base names, *.base.eth): resolve a Basename to its address, or an address to its verified primary Basename, with owner, resolver, avatar, url and twitter records.", t: ["basename", "base name", "name resolve", "reverse lookup", "identity"] },
  "/v1/stablepeg": { d: "Stablecoin peg / depeg monitor API: live price and $1 peg deviation for USDT, USDC, DAI, USDe and other USD stablecoins, with depeg flag, mechanism, circulating supply and 1d/7d supply change; filter by symbols.", t: ["stablecoin peg", "depeg", "stablecoin price", "usdt", "usdc"] },
  "/v1/cryptonews": { d: "Crypto news API for AI agents: latest headlines from CoinDesk, Cointelegraph, Decrypt and The Block, merged and deduped, filtered by keyword or ticker (BTC, ETH, SOL…) and time window, newest first.", t: ["crypto news", "news", "headlines", "market news", "bitcoin news"] },
  "/v1/weather": { d: "Weather API: current weather and up to 16-day forecast for any city or lat/lon — temperature, feels-like, humidity, wind, rain chance, UV, sunrise/sunset; metric or imperial. Open-Meteo data.", t: ["weather", "forecast", "temperature", "weather api", "city weather"] },
  "/v1/addrprofile": { d: "Wallet address check API before you pay or send: is this address a wallet (EOA), smart contract, proxy, Safe or EIP-7702 account; nonce, ETH and USDC balance, known labels and a 0-100 risk score with reasons. Base default; Ethereum, Optimism, Arbitrum, Polygon.", t: ["address check", "wallet screening", "is contract", "address risk", "before you pay"] },
  "/v1/usdcamount": { d: "USDC amount converter for x402 payments: dollars <-> atomic units (6 decimals) with precision guard, x402 amount strings, the native USDC contract address, EIP-55 checksum and EIP-712 domain per chain (Base, Base Sepolia, Ethereum, Arbitrum, Optimism, Polygon, Avalanche, Solana).", t: ["usdc", "x402", "amount converter", "atomic units", "eip-712 domain"] },
  "/v1/paymentheader": { d: "x402 payment header decoder / debugger: paste an X-PAYMENT (v1) or PAYMENT-SIGNATURE (v2) header, get the decoded payload, recovered EIP-3009 signer, time-window check and a field-by-field match against the 402 requirements — find out why a payment was rejected. Pure compute.", t: ["x402", "payment header", "decode", "debug payment", "eip-3009"] },
  "/v1/verify": { d: "USDC payment verification API: did a USDC payment from payer to payee for an exact amount land on Base (or Base Sepolia)? Returns the matching on-chain transfer for your invoice.", t: ["payment verification", "usdc", "verify payment", "invoice", "base"] },
};
export function searchDescription(path) { const c = SEARCH_COPY[path]; return c ? c.d + PAYNOTE : null; }
export function applySearchCopy(table, { tags = true } = {}) {
  for (const [p, c] of Object.entries(SEARCH_COPY)) {
    const e = table[p]; if (!e) continue;
    e.description = c.d + PAYNOTE;
    if (tags && Array.isArray(e.tags)) e.tags = [...new Set([...c.t.slice(0, 3), ...e.tags, ...c.t])].slice(0, 5);
  }
  return table;
}
export const HEADLINE = "Pay-per-call data APIs for AI agents, $0.02 USDC per call via x402 on Base (no API key, no signup): crypto token prices, wallet balances & portfolios, gas prices, transaction decode & status, ENS / Basenames resolve, token info & address checks, web page fetch to markdown, crypto news, weather, perp funding rates, stablecoin pegs, x402 payment tools — 600+ endpoints.";

// Plain-word URL aliases (Greg t213u): same handler, price, metadata; separate resource URL so search/routers match the path.
export const ALIASES = {
  "/v1/token-price": "/v1/tokenprice", "/v1/gas-price": "/v1/gasfee", "/v1/wallet/token-balances": "/v1/erc20balances", "/v1/web/fetch": "/v1/fetch",
  "/v1/wallet/portfolio": "/v1/portfolio", "/v1/wallet/balance": "/v1/nativebalances", "/v1/tx/decode": "/v1/txsummary", "/v1/tx/status": "/v1/txstatus",
  "/v1/token/info": "/v1/tokeninfo", "/v1/ens/resolve": "/v1/ens", "/v1/basename/resolve": "/v1/basename", "/v1/perp/funding-rate": "/v1/perpfunding",
  "/v1/stablecoin/peg": "/v1/stablepeg", "/v1/crypto/news": "/v1/cryptonews", "/v1/weather/forecast": "/v1/weather", "/v1/address/check": "/v1/addrprofile",
};
export const canonical = (p) => ALIASES[p] || p;
export function addAliases(table, clone = (v) => ({ ...v })) { for (const [a, c] of Object.entries(ALIASES)) if (table[c] && !table[a]) table[a] = clone(table[c]); return table; }

import { PAY_TEST_HTML } from "./paytest.js";
import { isAddr, isTx, pad32, toUnits, matchTransfers, verdict, checkX402, scoreAddress, safeUrl, canon, classifyTraffic, b64u, sha256hex, TRANSFER_TOPIC } from "./lib.js";
import { manifests } from "./manifests.js";
import { a2a } from "./a2a.js";
import { sellerHealth, deliveryAttest, verifyAttestation } from "./products.js";
import { mcp } from "./mcp.js";
import { fetchPage } from "./fetchpage.js";
import { util, contacts, batch } from "./tools.js";
import { netintel } from "./netintel.js";
import { transform, redirects, sitemap } from "./pack3.js";
import { cronparse } from "./cron.js";
import { abidecode, evmtx } from "./evm.js";
import { sigrecover, svgsanitize } from "./sig.js";
import { evmlog } from "./evmlog.js";
import { userop, evmaddr } from "./aa.js";
import { soltx } from "./soltx.js";
import { x402check, eip3009, paymentheader, usdcamount } from "./x402tools.js";
import { addrprofile, allowance, ens, addrpoison } from "./walletintel.js";
import { tokeninfo, nftmeta, txsummary, batchdecode } from "./onchain.js";
import { tokenprice, gasfee, safetx, portfolio } from "./chaindata.js";
import { polymarket, blocktime, weather, uptime, cryptonews, yieldpools, dexquote } from "./packb.js";
import { pegcheck, oracleprice, fxrate } from "./packb2.js";
import { simcall, nonce, tokenholders, solbalance, whois, feedparse } from "./wave2b.js";
import { namesbatch, sentiment } from "./packb3.js";
import { stablesupply, ensexpiry, safeowners, eip712hash, feehistory } from "./packb4.js";
import { chaininfo, tokenlist, gascompare } from "./packb5.js";
import { verified, fnsig, hacks, trending } from "./packb6.js";
import { coinsearch, pricehistory, osvcheck, pkginfo } from "./packb7.js";
import { holidays, wiki, arxiv, hnsearch } from "./packb8.js";
import { transfers, ensrecords, readcontract, nativebalances } from "./packb9.js";
import { contractage, walletage, approvals, usdcauth } from "./packb10.js";
import { balanceat, nftowner, mintburn, txfees } from "./packb11.js";
import { permit2, storageslot, cctpstatus, bridgequote } from "./packb12.js";
import { finality, facilitators, gasrunway, admins } from "./packb13.js";
import { noncegap, priceat, paymaster, usdcblacklist } from "./packb15.js";
import { sanctioned, usdtblacklist, lpposition, rpchealth } from "./packb16.js";
import { sig1271, compound, create2, feedhealth } from "./packb17.js";
import { eip7702, accountkind, erc165, blockhash } from "./packb18.js";
import { aanonce, transfersim, paused, tokenbatch } from "./packb19.js";
import { txbatch, balancediff, eip712domain, basefeenext } from "./packb20.js";
import { authpayload, multicall, erc1155bal, eventtopic } from "./packb21.js";
import { authverify, rawtx, rolecheck, ownership } from "./packb22.js";
import { v3pool, abiencode, units, msghash } from "./packb23.js";
import { txbuild, safehash, userophash, revertdecode } from "./packb24.js";
import { permitdata, permit2data, namehash, x402req } from "./packb25.js";
import { sigformat, selectors, codemeta, aeropool } from "./packb26.js";
import { createaddr, revokebuild, transferbuild, cometpos } from "./packb27.js";
import { wrapbuild, multisend, aavebuild, rlpcodec } from "./packb28.js";
import { approvebuild, nftsendbuild, ethsendbuild, cometbuild } from "./packb29.js";
import { swapbuild, vaultbuild, accesslist, permit2build } from "./packb30.js";
import { aeroswap, cometrewards, authhash, canceltx } from "./packb31.js";
import { payoutbatch, safeexec, morphobuild, pullbuild } from "./packb32.js";
import { nativesweep, tokensweep, delegatebuild, wstethbuild } from "./packb33.js";
import { create2deploy, ethairdrop, lpcollect, permitsubmit } from "./packb34.js";
import { tokenairdrop, safeownerbuild, nonceclear, cctpburn } from "./packb35.js";
import { l2deposit, l2withdraw, sendcalls, safecreate } from "./packb36.js";
import { erc1155send, nftapprovalall, permit2lockdown, cancelauth } from "./packb37.js";
import { acrossdeposit, lidowithdraw, lidoclaim, permit2nonce } from "./packb38.js";
import { supplysiderev, optionspremium, lnnodehist, solsupply } from "./pack50.js";
import { cowquote, cowstatus, cowcancel, cowpresign } from "./packb39.js";
import { optionsnotional, perpaggs, perpoi, solstakerewards } from "./pack51.js";
import { kyberswap, veloraswap, lifiquote, swapbest } from "./packb40.js";
import { mcaptvl, categorymcap, multichain, solblock } from "./pack52.js";
import { relayquote, relaystatus, dlnorder, dlnstatus } from "./packb41.js";
import { btcblockaudit, btcauditscores, btcpredictions, btcpoolaudit } from "./pack53.js";
import { acrossstatus, acrosslimits, cctpmint, cctpfee } from "./packb42.js";
import { lnchannel, lnfees, solleaderslots, soltxcount } from "./pack54.js";
import { yieldpredict, yieldsharpe, yieldmovers, yieldtoken } from "./pack55.js";
import { lifistatus, lifiroutes, lifirefuel, lzmessage } from "./packb43.js";
import { yieldlp, yieldrewards, yieldprojects, yieldchains } from "./pack56.js";
import { whstatus, whvaa, axelarstatus, axelargas } from "./packb44.js";
import { lngeo, lnfeatures, btcrewardhist, solstakeparams } from "./pack57.js";
import { mayanquote, mayanstatus, symbiosisswap, symbiosisstatus } from "./packb45.js";
import { solshield, jupholdings, juplimitorders, jupdca } from "./pack58.js";
import { juplend, juplendpos, juplst, jupdexlabels } from "./pack59.js";
import { pendlemarkets, pendleswap, pendlepositions, balancerquote } from "./packb46.js";
import { curvepools, curvelend, curveswap, crvusdmarkets } from "./packb47.js";
import { treasuryrev, userfees, feecats, feehist } from "./pack60.js";
import { yearnvaults, yearnbuild, beefyvaults, beefybuild } from "./packb48.js";
import { jupborrow, jupborrowcap, soltokenbal, btcblockattime } from "./pack61.js";
import { savingsrates, savingsbuild, susdecooldown, usdsconvert } from "./packb49.js";
import { prottokens, protchaintvl, protraises, chaintvlhist } from "./pack62.js";
import { fluidlend, fluidbuild, fluidvaults, fluidpositions } from "./packb50.js";
import { merklrewards, merklclaim, merklopps, morphovaults } from "./packb51.js";
import { prottvlhist, prothallmarks, defitvlhist, protcompare } from "./pack63.js";
import { uniquote, uniswapbuild, unipools, uniposition } from "./packb52.js";
import { moonwellmarkets, moonwellposition, moonwellbuild, moonwellenter } from "./packb53.js";
import { pricebatchhist, pricelookback, solblockrange, soltokenacct } from "./pack64.js";
import { aavemarkets, sparkmarkets, sparkposition, sparkbuild } from "./packb54.js";
import { protdexvol, protoptionsvol, stablecoindetail, stabledepegs } from "./pack65.js";
import { eulervaults, eulervault, eulerposition, eulerbuild } from "./packb55.js";
import { rethstats, rethbuild, weethstats, weethbuild } from "./packb56.js";
import { dvol, optionsoi, maxpain, perpfundhist } from "./pack66.js";
import { realizedvol, futuresbasis, optionsflow, ivsmile } from "./pack67.js";
import { v4pools, v4quote, v4swapbuild, v4position } from "./packb57.js";
import { obdepth, krakenohlc, cexspread, krakenpair } from "./pack68.js";
import { skysavings, skysavingsbuild, savingsposition, susdestats } from "./packb58.js";
import { cexarb, cexvolume, deribitsettle, krakentrades } from "./pack69.js";
import { v2pair, v2quote, v2swapbuild, v2lp } from "./packb59.js";
import { morphoposition, morphomarket, morphovault, morphovaultpos } from "./packb60.js";
import { cbcandles, bitstampbook, stablepxhist, soltxstatus } from "./pack70.js";
import { easattest, easschema, easattestbuild, easrevokebuild } from "./packb61.js";
import { cbtrades, bitstampohlc, krakenspreadhist, deribitfutflow } from "./pack71.js";
import { balancerpools, balancerpool, balancerposition, balancerswapbuild } from "./packb62.js";
import { okxfunding, okxlongshort, geminibook, kucoinstats } from "./pack72.js";
import { aerogauge, aerostake, aeroclaimbuild, aerolock } from "./packb63.js";
import { okxoi, okxtakervol, bfxfunding, kucoinbook } from "./pack73.js";
import { gmxmarkets, gmxprices, gmxglv, gmxlp } from "./packb64.js";
import { bfxpositions, geminitrades, kucoinfunding, bfxticker } from "./pack74.js";
import { dydxmarkets, dydxbook, dydxfunding, dydxcandles } from "./packb65.js";
import { geminicandles, kucoinohlc, okxohlc, bfxohlc } from "./pack75.js";
import { pmbook, pmhistory, pmholders, pmpositions } from "./packb66.js";
import { kucointrades, okxtrades, bfxtrades, okxtickers } from "./pack76.js";
import { kalshimarket, kalshibook, kalshitrades, kalshicandles } from "./packb67.js";
import { blockbytime, supplyat, codematch, l1fee } from "./packb14.js";
import { basename, permitcheck, contractrisk, txstatus, paycheck, siwe } from "./pack6.js";
import { evmrpc, erc20balances, walletlabels, defistats } from "./pack7.js";
import { l2status, pairliq, mevstyle, vault4626 } from "./pack8.js";
import { lstrate, lendrates, ghrepo, restaking } from "./pack9.js";
import { spltoken, aavehealth, morphomarkets, tokensafety } from "./pack10.js";
import { blobfee, stablepeg, dexvolume, chainfees } from "./pack11.js";
import { chaintvl, tvlmovers, protocolinfo, cexreserves } from "./pack12.js";
import { btcfees, btcaddr, btctx, btcnetwork } from "./pack13.js";
import { geocode, airquality, quakes, suntimes } from "./pack14.js";
import { x402revenue, x402settle, x402payer, tokenflows } from "./pack15.js";
import { x402pulse, whalemoves, newpools, poolswaps } from "./pack16.js";
import { nftmints, liquidations, bridgeflows, stablemint } from "./pack17.js";
import { proxyinfo, hotcontracts, builders, newcontracts } from "./pack18.js";
import { aaactivity, blockspace, ethburn, safeactivity } from "./pack19.js";
import { hlbook, hlcandles, hlspot, fundinghist } from "./pack21.js";
import { cctpflows, perpfunding, dexboosts, hlaccount } from "./pack20.js";
import { hltrades, hlorders, hlvault, cctpinflows } from "./pack22.js";
import { hlfills, hlfundpay, hlstake, dexsearch } from "./pack23.js";
import { hlledger, hlpnl, hltwap, hloi } from "./pack24.js";
import { hlspotbal, hlfees, hlidentity, hlvaultpos } from "./pack25.js";
import { fundingarb, tokenpairs, protocolfees, feesrank } from "./pack26.js";
import { optionsrank, pricechange, yieldhist, tokenlaunch } from "./pack27.js";
import { hip3dexs, hip3markets, hlauction, hltoken } from "./pack28.js";
import { stablechains, stableflows, chaindexvol, hlvalidators } from "./pack29.js";
import { tokenvol, tokencorr, stableyields, categorytvl } from "./pack30.js";
import { solquote, solprio, solepoch, btcpools } from "./pack31.js";
import { solvalidators, solactivity, btcdiff, btcrewards } from "./pack32.js";
import { btcutxo, btcblock, btcrbf, btcpool } from "./pack33.js";
import { solprice, soltoken, soltrending, solinflation } from "./pack34.js";
import { btcmempool, btchalving, solnewtokens, btccpfp } from "./pack35.js";
import { btcaddress, btchashrate, btcfeehist, soltoptraded } from "./pack36.js";
import { btclightning, lnnodes, btcblockfees, solimpact } from "./pack37.js";
import { btcminerrev, btcblocksize, lncountries, lnisps } from "./pack38.js";
import { lnnode, btcrecenttx, solverified, btcfeecalc } from "./pack39.js";
import { lnchannels, blockattime, tokenchange, btchistprice } from "./pack40.js";
import { tokenfirstprice, soltps, stablehist, tokendrawdown } from "./pack41.js";
import { solskiprate, soltxhist, solaccount, solblocktime } from "./pack42.js";
import { solleaders, solversions, solbalances, lnsearch } from "./pack43.js";
import { btcrecentblocks, btcpooldom, btcoutspends, btcvalidate } from "./pack44.js";
import { dexaggs, bridgeaggs, aggshare, lncountry } from "./pack45.js";
import { lnveterans, optionsvol, holdersrevenue, lnisp } from "./pack46.js";
import { protocolrevenue, takerate, lnconnected, lnliquidity } from "./pack47.js";
import { feegrowth, revenuegrowth, dexgrowth, categoryfees } from "./pack48.js";
import { poolhashrate, btcdiffadj, stabledominance, stablegrowth } from "./pack49.js";
import { subtitle } from "./subtitle.js";
import { imgmeta, avmeta, qr } from "./media.js";
import { paidConfig, challenge, requirements, requirementsV2, v2Headers, decode, verifyPayment, settlePayment, PAID_PATHS, x402BodyPreference } from "./x402.js";

const J = (obj, status = 200, extra = {}) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json", "access-control-allow-origin": "*", ...extra } });

async function rpc(env, method, params) {
  const r = await fetch(env.RPC_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const j = await r.json(); if (j.error) throw new Error("rpc:" + j.error.message); return j.result;
}
const head = async (env) => parseInt(await rpc(env, "eth_blockNumber", []), 16);

const CHAINS = {
  base: { NETWORK: "base", CHAIN_ID: "8453", USDC_ADDRESS: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", rpcVar: "RPC_URL_MAINNET", rpcDefault: "https://base-rpc.publicnode.com", CHUNK: 1000, MAXSPAN: 5000 },
  "base-sepolia": { NETWORK: "base-sepolia", CHAIN_ID: "84532", USDC_ADDRESS: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", rpcVar: "RPC_URL_SEPOLIA", rpcDefault: "https://sepolia.base.org", CHUNK: 200, MAXSPAN: 2000 },
};
// network param: default Base mainnet; "base-sepolia" optional. Returns null on unknown network.
export function chainEnv(env, network) {
  const c = CHAINS[network || env.DEFAULT_NETWORK || "base"]; if (!c) return null;
  return { ...env, ...c, RPC_URL: env[c.rpcVar] || c.rpcDefault };
}
const BADNET = () => J({ error: "network must be base (default) or base-sepolia" }, 400);
async function verify(env0, q) {
  const env = chainEnv(env0, q.get("network")); if (!env) return BADNET();
  const payer = q.get("payer"), payTo = q.get("payee"), invoice = q.get("invoice") || "", amount = q.get("amount");
  if (!isAddr(payer) || !isAddr(payTo) || !amount || !/^[\w.:-]{1,64}$/.test(invoice)) return J({ error: "params: payer, payee (0x addr), amount (USDC decimal), invoice ([\\w.:-]{1,64})" }, 400);
  let units; try { units = toUnits(amount); } catch { return J({ error: "bad amount" }, 400); }
  const h = await head(env);
  // public RPCs cap eth_getLogs ranges; scan newest-first in per-network chunks (≤10 subrequests)
  const span = Math.min(parseInt(q.get("lookback_blocks") || "1800", 10) || 1800, env.MAXSPAN);
  const logs = [];
  for (let to = h; to > h - span && to >= 0; to -= env.CHUNK) {
    const from = Math.max(0, to - env.CHUNK + 1, h - span + 1);
    logs.push(...await rpc(env, "eth_getLogs", [{ address: env.USDC_ADDRESS, fromBlock: "0x" + from.toString(16), toBlock: "0x" + to.toString(16), topics: [TRANSFER_TOPIC, pad32(payer), pad32(payTo)] }]));
    if (logs.some((l) => BigInt(l.data) === units)) break;
  }
  const v = verdict(matchTransfers(logs, { payer, payTo, units, usdc: env.USDC_ADDRESS }), h);
  return J({ network: env.NETWORK, invoice, payer, payee: payTo, amount, ...v, binding: "payer+payee+exact_amount within lookback window", lookback_blocks: span, head: h });
}

async function risk(env0, q) {
  const env = chainEnv(env0, q.get("network")); if (!env) return BADNET();
  const address = q.get("address"), endpoint = q.get("endpoint");
  if (address) {
    if (!isAddr(address)) return J({ error: "bad address" }, 400);
    const [code, nonceHex] = await Promise.all([rpc(env, "eth_getCode", [address, "latest"]), rpc(env, "eth_getTransactionCount", [address, "latest"])]);
    return J({ network: env.NETWORK, address, ...scoreAddress({ code, nonce: parseInt(nonceHex, 16) }) });
  }
  if (endpoint) {
    const url = safeUrl(endpoint); if (!url) return J({ error: "endpoint must be public https" }, 400);
    const ctl = AbortSignal.timeout(5000);
    let doc = null, how = "";
    try {
      const wk = await fetch(new URL("/.well-known/x402", url), { signal: ctl, redirect: "manual" });
      if (wk.ok) { doc = await wk.json(); how = "well-known"; }
      else { const r = await fetch(url, { signal: ctl, redirect: "manual" }); if (r.status === 402) { doc = await r.json().catch(() => null); how = "402-challenge"; } }
    } catch (e) { return J({ endpoint, score: 0, reasons: ["unreachable"] }); }
    if (!doc) return J({ endpoint, score: 20, reasons: ["no_x402_manifest_or_402"] });
    return J({ endpoint, source: how, ...checkX402(doc) });
  }
  return J({ error: "need address= or endpoint=" }, 400);
}

async function signingKey(env) {
  const jwk = JSON.parse(env.RECEIPT_SIGNING_KEY_JWK);
  return crypto.subtle.importKey("jwk", jwk, { name: "Ed25519" }, false, ["sign"]);
}
async function pubKey(env) {
  const { d, ...pub } = JSON.parse(env.RECEIPT_SIGNING_KEY_JWK); return { ...pub, key_ops: ["verify"] };
}

async function receipt(env0, req) {
  let b; try { b = await req.json(); } catch { return J({ error: "json body" }, 400); }
  const env = chainEnv(env0, (b && b.network) || new URL(req.url).searchParams.get("network")); if (!env) return BADNET();
  const { tx_hash, payer, payee, amount, invoice = "", resource = "" } = b || {};
  if (!isTx(tx_hash) || !isAddr(payer) || !isAddr(payee) || !amount) return J({ error: "need tx_hash,payer,payee,amount" }, 400);
  let units; try { units = toUnits(amount); } catch { return J({ error: "bad amount" }, 400); }
  const rc = await rpc(env, "eth_getTransactionReceipt", [tx_hash]);
  if (!rc || rc.status !== "0x1") return J({ error: "tx not found or failed" }, 404);
  const m = matchTransfers(rc.logs, { payer, payTo: payee, units, usdc: env.USDC_ADDRESS }).find((x) => x.exact);
  if (!m) return J({ error: "no matching USDC transfer in tx" }, 422);
  const prev = env.DB ? await env.DB.prepare("SELECT receipt_hash FROM receipts ORDER BY seq DESC LIMIT 1").first() : null;
  const body = { v: 1, issuer: env.OPERATOR_NAME, network: env.NETWORK, chain_id: Number(env.CHAIN_ID), tx_hash, block: m.block, payer: payer.toLowerCase(), payee: payee.toLowerCase(), amount, token: env.USDC_ADDRESS, invoice: String(invoice).slice(0, 128), resource: String(resource).slice(0, 256), issued_at: new Date().toISOString(), prev_hash: prev ? prev.receipt_hash : "0".repeat(64) };
  const c = canon(body);
  const sig = b64u(await crypto.subtle.sign("Ed25519", await signingKey(env), new TextEncoder().encode(c)));
  const receipt_hash = await sha256hex(c);
  if (env.DB) await env.DB.prepare("INSERT INTO receipts (receipt_hash, prev_hash, body, ts) VALUES (?,?,?,?)").bind(receipt_hash, body.prev_hash, c, body.issued_at).run();
  return J({ receipt: body, canonical: "sorted-key JSON", alg: "Ed25519", kid: (await pubKey(env)).kid, signature: sig, receipt_hash });
}

// Free sibling of /v1/receipt. Validators probe it with GET / empty POST: answer 200 with usage + a live self-signed sample instead of 404/400.
const RECEIPT_VERIFY = new Set(["/v1/receipt/verify", "/v1/receipt/verify/", "/v1/receipts/verify", "/v1/verify-receipt", "/v1/verify_receipt"]);
async function sampleReceipt(env) {
  const receipt = { v: 1, issuer: env.OPERATOR_NAME || "Beggar Bot", sample: true, network: env.NETWORK || "base", amount: "0.02", invoice: "sample", issued_at: "2026-01-01T00:00:00.000Z" };
  const k = await signingKey(env), sig = await crypto.subtle.sign("Ed25519", k, new TextEncoder().encode(canon(receipt)));
  return { receipt, signature: b64u(sig) };
}
async function verifyReceipt(env, req, url) {
  const usage = async () => ({ usage: "POST JSON {receipt: object, signature: base64url} (or GET ?receipt=<json|base64url json>&signature=...) -> {valid}. Free. Keys: /.well-known/beggar-bot-keys.json", alg: "Ed25519", canonical: "sorted-key JSON", ...(await (async () => { try { return { kid: (await pubKey(env)).kid, example: await sampleReceipt(env) }; } catch { return {}; } })()) });
  let b = null;
  if (req.method === "POST") { const t = await req.text(); if (t.trim()) { try { b = JSON.parse(t); } catch { return J({ error: "json body", ...(await usage()) }, 400); } } }
  else { const q = url.searchParams; if (q.get("receipt") || q.get("token")) b = { receipt: q.get("receipt") || q.get("token"), signature: q.get("signature") || q.get("sig") || "" }; }
  if (b && typeof b === "object" && b.token && !b.receipt) b.receipt = b.token;
  if (b && typeof b.receipt === "string") { const r = b.receipt.trim(); try { b.receipt = JSON.parse(r.startsWith("{") ? r : decodeURIComponent(escape(atob(r.replace(/-/g, "+").replace(/_/g, "/"))))); } catch { return J({ error: "receipt string must be JSON or base64url JSON" }, 400); } }
  if (!b || (typeof b === "object" && !Array.isArray(b) && Object.keys(b).length === 0)) return J({ valid: null, ...(await usage()) });
  if (typeof b !== "object" || !b.receipt || typeof b.receipt !== "object" || typeof b.signature !== "string" || !b.signature) return J({ error: "need receipt (object) and signature (base64url string)" }, 400);
  const k = await crypto.subtle.importKey("jwk", await pubKey(env), { name: "Ed25519" }, false, ["verify"]);
  let sig; try { sig = Uint8Array.from(atob(b.signature.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)); } catch { return J({ error: "signature must be base64url" }, 400); }
  if (sig.length !== 64) return J({ error: "signature must be 64 bytes (base64url)" }, 400);
  const ok = await crypto.subtle.verify("Ed25519", k, sig, new TextEncoder().encode(canon(b.receipt)));
  return J({ valid: ok, kid: (await pubKey(env)).kid });
}

async function logCall(env, req, url, status, started, ipHash) {
  if (!env.DB) return;
  const ua = req.headers.get("user-agent") || "";
  const selftestOk = !!env.SELFTEST_TOKEN && req.headers.get("x-beggar-selftest") === env.SELFTEST_TOKEN;
  const operatorHashes = (env.OPERATOR_IP_HASHES || "").split(",").filter(Boolean);
  const cls = req.__pay?.self ? "SELF_GENERATED" : classifyTraffic({ selftestOk, ua, path: url.pathname, ipHash, operatorHashes, status });
  const shape = [...url.searchParams.keys()].sort().join(",");
  await env.DB.prepare("INSERT INTO calls (ts,route,status,latency_ms,ip_hash,asn,ua,agent_hdr,referrer,query_shape,x_payment,traffic_class) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
    .bind(new Date().toISOString(), url.pathname.slice(0, 128), status, Date.now() - started, ipHash, String(req.cf?.asn ?? ""), ua.slice(0, 200), (req.headers.get("x-agent") || req.headers.get("a2a-agent") || "").slice(0, 120), (req.headers.get("referer") || "").slice(0, 200), shape, req.headers.get("x-payment") ? 1 : 0, cls).run();
}

async function paywall(env, req, url) {
  if (!PAID_PATHS.has(url.pathname)) return null;
  // operator self-test only: valid secret header skips payment (never pays, never settles)
  if (env.SELFTEST_TOKEN && req.headers.get("x-beggar-selftest") === env.SELFTEST_TOKEN) return null;
  const cfg = paidConfig(env, url.pathname); if (!cfg.enabled) return null;
  const resource = url.origin + url.pathname, desc = "Beggar Bot " + url.pathname;
  const sig = req.headers.get("payment-signature"), x = sig || req.headers.get("x-payment"), version = sig ? 2 : 1;
  if (!x) {
    const pref = x402BodyPreference(req, url);
    if (pref.error) return J({ error: pref.error, hint: "Use header x402-version: 2 and/or query ?x402=2 for a body that matches PAYMENT-REQUIRED (v2). Default unpaid 402 keeps legacy dual-stack (body v1 + header v2)." }, 400);
    return challenge(cfg, resource, desc, { matchV2Body: pref.match });
  }
  const v1reqs = requirements(cfg, resource, desc), reqs = version === 2 ? requirementsV2(cfg) : v1reqs, payload = decode(x);
  const v = await verifyPayment(cfg, payload, reqs, version);
  if (!v.ok) return J({ x402Version: 1, error: "payment_invalid", reason: v.reason, accepts: [v1reqs] }, 402, v2Headers(cfg, resource, desc, "payment_invalid: " + v.reason));
  const from = String(payload?.payload?.authorization?.from || "").toLowerCase();
  const selfPayers = (env.SELF_PAYERS || "").toLowerCase().split(",").filter(Boolean);
  req.__pay = { cfg, payload, reqs, v1reqs, version, resource, desc, from, self: selfPayers.includes(from) }; return null;
}

export async function scheduled(event, env) {
  if (env.DB) await env.DB.prepare("DELETE FROM calls WHERE ts < ?").bind(new Date(Date.now() - 30 * 864e5).toISOString()).run();
}

export async function handle(req, env) {
  const url = new URL(req.url), started = Date.now();
  const ip = req.headers.get("cf-connecting-ip") || "";
  const ipNet = ip.includes(".") ? ip.split(".").slice(0, 3).join(".") : ip.split(":").slice(0, 3).join(":");
  const ipHash = (await sha256hex((env.IP_HASH_SALT || "") + ipNet)).slice(0, 16);
  let res;
  try {
    if (req.method === "OPTIONS" && env.CORS_PREFLIGHT === "true") return new Response(null, { status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "Content-Type, X-PAYMENT, PAYMENT-SIGNATURE, x402-version, Mcp-Session-Id, MCP-Protocol-Version", "access-control-expose-headers": "X-PAYMENT-RESPONSE, PAYMENT-REQUIRED, PAYMENT-RESPONSE", "access-control-max-age": "600" } });
    if (env.BEGGAR_DEMAND_TESTS_ENABLED !== "true") res = J({ error: "service disabled" }, 503);
    else if (manifests[url.pathname]) { const m = manifests[url.pathname](env, url.origin); res = new Response(m.body, { headers: { "content-type": m.type, "access-control-allow-origin": "*" } }); }
    else if (url.pathname === "/pay-test" && env.PAY_TEST_PAGE === "true") res = new Response(PAY_TEST_HTML, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
    else if (url.pathname === "/a2a" || url.pathname === "/a2a/") { res = await a2a(req, env, url.origin); }
    else if (url.pathname === "/mcp" || url.pathname === "/mcp/") { const c = paidConfig(env); res = await mcp(req, env, handle, c.enabled ? String(Number(c.atomic) / 1e6) : null); }
    else if (url.pathname === "/.well-known/beggar-bot-keys.json") res = J({ keys: [await pubKey(env)] });
    else if (url.pathname.startsWith("/v1/") && (res = await paywall(env, req, url))) {}
    else if (url.pathname === "/v1/verify" && req.method === "GET") res = await verify(env, url.searchParams);
    else if (url.pathname === "/v1/risk" && req.method === "GET") res = await risk(env, url.searchParams);
    else if (url.pathname === "/v1/receipt" && req.method === "POST") res = await receipt(env, req);
    else if (RECEIPT_VERIFY.has(url.pathname) && (req.method === "POST" || req.method === "GET" || req.method === "HEAD")) res = await verifyReceipt(env, req, url);
    else if (url.pathname === "/v1/seller-health" && req.method === "GET") { const o = await sellerHealth(url.searchParams); res = J(o.body, o.status); }
    else if (url.pathname === "/v1/delivery-attest" && req.method === "POST") {
      let b; try { b = await req.json(); } catch { b = null; }
      if (!b) res = J({ error: "json body" }, 400);
      else { const ce = chainEnv(env, b.network || url.searchParams.get("network")); if (!ce) res = BADNET(); else { const o = await deliveryAttest(ce, b, { rpc, signingKey, pubKey }); res = J(o.body, o.status); } }
    }
    else if (url.pathname === "/v1/delivery-attest/verify" && req.method === "GET") { const o = await verifyAttestation(env, url.searchParams, pubKey); res = J(o.body, o.status); }
    else if (url.pathname === "/v1/fetch" && (req.method === "GET" || req.method === "POST")) {
      let target = url.searchParams.get("url");
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} target = (b && b.url) || target; }
      const o = await fetchPage(target); res = J(o.body, o.status);
    }
    else if ((url.pathname === "/v1/util" || url.pathname === "/v1/contacts") && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = url.pathname === "/v1/util" ? await util(a) : await contacts(a.url); res = J(o.body, o.status);
    }
    else if (url.pathname === "/v1/netintel" && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await netintel(a); res = J(o.body, o.status);
    }
    else if (["/v1/transform", "/v1/redirects", "/v1/sitemap", "/v1/cronparse", "/v1/abidecode", "/v1/evmtx", "/v1/imgmeta", "/v1/avmeta", "/v1/qr", "/v1/sigrecover", "/v1/svgsanitize", "/v1/evmlog", "/v1/userop", "/v1/evmaddr", "/v1/soltx", "/v1/subtitle", "/v1/x402check", "/v1/eip3009", "/v1/paymentheader", "/v1/usdcamount", "/v1/addrprofile", "/v1/allowance", "/v1/ens", "/v1/addrpoison", "/v1/tokeninfo", "/v1/nftmeta", "/v1/txsummary", "/v1/batchdecode", "/v1/tokenprice", "/v1/gasfee", "/v1/safetx", "/v1/portfolio", "/v1/basename", "/v1/permitcheck", "/v1/contractrisk", "/v1/txstatus", "/v1/paycheck", "/v1/siwe"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/transform": transform, "/v1/redirects": redirects, "/v1/sitemap": sitemap, "/v1/cronparse": cronparse, "/v1/abidecode": abidecode, "/v1/evmtx": evmtx, "/v1/imgmeta": imgmeta, "/v1/avmeta": avmeta, "/v1/qr": qr, "/v1/sigrecover": sigrecover, "/v1/svgsanitize": svgsanitize, "/v1/evmlog": evmlog, "/v1/userop": userop, "/v1/evmaddr": evmaddr, "/v1/soltx": soltx, "/v1/subtitle": subtitle, "/v1/x402check": x402check, "/v1/eip3009": eip3009, "/v1/paymentheader": paymentheader, "/v1/usdcamount": usdcamount, "/v1/addrprofile": addrprofile, "/v1/allowance": allowance, "/v1/ens": ens, "/v1/addrpoison": addrpoison, "/v1/tokeninfo": tokeninfo, "/v1/nftmeta": nftmeta, "/v1/txsummary": txsummary, "/v1/batchdecode": batchdecode, "/v1/tokenprice": tokenprice, "/v1/gasfee": gasfee, "/v1/safetx": safetx, "/v1/portfolio": portfolio, "/v1/basename": basename, "/v1/permitcheck": permitcheck, "/v1/contractrisk": contractrisk, "/v1/txstatus": txstatus, "/v1/paycheck": paycheck, "/v1/siwe": siwe })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/evmrpc", "/v1/erc20balances", "/v1/walletlabels", "/v1/defistats", "/v1/polymarket", "/v1/blocktime", "/v1/weather", "/v1/uptime", "/v1/cryptonews", "/v1/yieldpools", "/v1/dexquote"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/evmrpc": evmrpc, "/v1/erc20balances": erc20balances, "/v1/walletlabels": walletlabels, "/v1/defistats": defistats, "/v1/polymarket": polymarket, "/v1/blocktime": blocktime, "/v1/weather": weather, "/v1/uptime": uptime, "/v1/cryptonews": cryptonews, "/v1/yieldpools": yieldpools, "/v1/dexquote": dexquote })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/pegcheck", "/v1/oracleprice", "/v1/fxrate"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/pegcheck": pegcheck, "/v1/oracleprice": oracleprice, "/v1/fxrate": fxrate })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/namesbatch", "/v1/sentiment"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/namesbatch": namesbatch, "/v1/sentiment": sentiment })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/l2status", "/v1/pairliq", "/v1/mevstyle", "/v1/vault4626"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/l2status": l2status, "/v1/pairliq": pairliq, "/v1/mevstyle": mevstyle, "/v1/vault4626": vault4626 })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/simcall", "/v1/nonce", "/v1/tokenholders", "/v1/solbalance", "/v1/whois", "/v1/feedparse"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/simcall": simcall, "/v1/nonce": nonce, "/v1/tokenholders": tokenholders, "/v1/solbalance": solbalance, "/v1/whois": whois, "/v1/feedparse": feedparse })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/lstrate", "/v1/lendrates", "/v1/ghrepo", "/v1/restaking"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/lstrate": lstrate, "/v1/lendrates": lendrates, "/v1/ghrepo": ghrepo, "/v1/restaking": restaking })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/stablesupply", "/v1/ensexpiry", "/v1/safeowners", "/v1/eip712hash", "/v1/feehistory"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/stablesupply": stablesupply, "/v1/ensexpiry": ensexpiry, "/v1/safeowners": safeowners, "/v1/eip712hash": eip712hash, "/v1/feehistory": feehistory })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/chaininfo", "/v1/tokenlist", "/v1/gascompare"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/chaininfo": chaininfo, "/v1/tokenlist": tokenlist, "/v1/gascompare": gascompare })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/spltoken", "/v1/aavehealth", "/v1/morphomarkets", "/v1/tokensafety"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/spltoken": spltoken, "/v1/aavehealth": aavehealth, "/v1/morphomarkets": morphomarkets, "/v1/tokensafety": tokensafety })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/verified", "/v1/fnsig", "/v1/hacks", "/v1/trending"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/verified": verified, "/v1/fnsig": fnsig, "/v1/hacks": hacks, "/v1/trending": trending })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/blobfee", "/v1/stablepeg", "/v1/dexvolume", "/v1/chainfees"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/blobfee": blobfee, "/v1/stablepeg": stablepeg, "/v1/dexvolume": dexvolume, "/v1/chainfees": chainfees })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/chaintvl", "/v1/tvlmovers", "/v1/protocolinfo", "/v1/cexreserves"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/chaintvl": chaintvl, "/v1/tvlmovers": tvlmovers, "/v1/protocolinfo": protocolinfo, "/v1/cexreserves": cexreserves })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/coinsearch", "/v1/pricehistory", "/v1/osvcheck", "/v1/pkginfo"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/coinsearch": coinsearch, "/v1/pricehistory": pricehistory, "/v1/osvcheck": osvcheck, "/v1/pkginfo": pkginfo })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/btcfees", "/v1/btcaddr", "/v1/btctx", "/v1/btcnetwork"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/btcfees": btcfees, "/v1/btcaddr": btcaddr, "/v1/btctx": btctx, "/v1/btcnetwork": btcnetwork })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/holidays", "/v1/wiki", "/v1/arxiv", "/v1/hnsearch"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/holidays": holidays, "/v1/wiki": wiki, "/v1/arxiv": arxiv, "/v1/hnsearch": hnsearch })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/geocode", "/v1/airquality", "/v1/quakes", "/v1/suntimes"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/geocode": geocode, "/v1/airquality": airquality, "/v1/quakes": quakes, "/v1/suntimes": suntimes })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/transfers", "/v1/ensrecords", "/v1/readcontract", "/v1/nativebalances"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/transfers": transfers, "/v1/ensrecords": ensrecords, "/v1/readcontract": readcontract, "/v1/nativebalances": nativebalances })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/x402revenue", "/v1/x402settle", "/v1/x402payer", "/v1/tokenflows"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/x402revenue": x402revenue, "/v1/x402settle": x402settle, "/v1/x402payer": x402payer, "/v1/tokenflows": tokenflows })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/contractage", "/v1/walletage", "/v1/approvals", "/v1/usdcauth"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/contractage": contractage, "/v1/walletage": walletage, "/v1/approvals": approvals, "/v1/usdcauth": usdcauth })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/x402pulse", "/v1/whalemoves", "/v1/newpools", "/v1/poolswaps"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/x402pulse": x402pulse, "/v1/whalemoves": whalemoves, "/v1/newpools": newpools, "/v1/poolswaps": poolswaps })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/balanceat", "/v1/nftowner", "/v1/mintburn", "/v1/txfees"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/balanceat": balanceat, "/v1/nftowner": nftowner, "/v1/mintburn": mintburn, "/v1/txfees": txfees })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/nftmints", "/v1/liquidations", "/v1/bridgeflows", "/v1/stablemint"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/nftmints": nftmints, "/v1/liquidations": liquidations, "/v1/bridgeflows": bridgeflows, "/v1/stablemint": stablemint })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/permit2", "/v1/storageslot", "/v1/cctpstatus", "/v1/bridgequote"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/permit2": permit2, "/v1/storageslot": storageslot, "/v1/cctpstatus": cctpstatus, "/v1/bridgequote": bridgequote })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/proxyinfo", "/v1/hotcontracts", "/v1/builders", "/v1/newcontracts"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/proxyinfo": proxyinfo, "/v1/hotcontracts": hotcontracts, "/v1/builders": builders, "/v1/newcontracts": newcontracts })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/finality", "/v1/facilitators", "/v1/gasrunway", "/v1/admins"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/finality": finality, "/v1/facilitators": facilitators, "/v1/gasrunway": gasrunway, "/v1/admins": admins })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/aaactivity", "/v1/blockspace", "/v1/ethburn", "/v1/safeactivity"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/aaactivity": aaactivity, "/v1/blockspace": blockspace, "/v1/ethburn": ethburn, "/v1/safeactivity": safeactivity })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/noncegap", "/v1/priceat", "/v1/paymaster", "/v1/usdcblacklist"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/noncegap": noncegap, "/v1/priceat": priceat, "/v1/paymaster": paymaster, "/v1/usdcblacklist": usdcblacklist })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/sanctioned", "/v1/usdtblacklist", "/v1/lpposition", "/v1/rpchealth"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/sanctioned": sanctioned, "/v1/usdtblacklist": usdtblacklist, "/v1/lpposition": lpposition, "/v1/rpchealth": rpchealth })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/sig1271", "/v1/compound", "/v1/create2", "/v1/feedhealth"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/sig1271": sig1271, "/v1/compound": compound, "/v1/create2": create2, "/v1/feedhealth": feedhealth })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/eip7702", "/v1/accountkind", "/v1/erc165", "/v1/blockhash"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/eip7702": eip7702, "/v1/accountkind": accountkind, "/v1/erc165": erc165, "/v1/blockhash": blockhash })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/aanonce", "/v1/transfersim", "/v1/paused", "/v1/tokenbatch"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/aanonce": aanonce, "/v1/transfersim": transfersim, "/v1/paused": paused, "/v1/tokenbatch": tokenbatch })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/txbatch", "/v1/balancediff", "/v1/eip712domain", "/v1/basefeenext"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/txbatch": txbatch, "/v1/balancediff": balancediff, "/v1/eip712domain": eip712domain, "/v1/basefeenext": basefeenext })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/authpayload", "/v1/multicall", "/v1/erc1155bal", "/v1/eventtopic"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/authpayload": authpayload, "/v1/multicall": multicall, "/v1/erc1155bal": erc1155bal, "/v1/eventtopic": eventtopic })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/authverify", "/v1/rawtx", "/v1/rolecheck", "/v1/ownership"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/authverify": authverify, "/v1/rawtx": rawtx, "/v1/rolecheck": rolecheck, "/v1/ownership": ownership })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/v3pool", "/v1/abiencode", "/v1/units", "/v1/msghash"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/v3pool": v3pool, "/v1/abiencode": abiencode, "/v1/units": units, "/v1/msghash": msghash })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/txbuild", "/v1/safehash", "/v1/userophash", "/v1/revertdecode"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/txbuild": txbuild, "/v1/safehash": safehash, "/v1/userophash": userophash, "/v1/revertdecode": revertdecode })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/permitdata", "/v1/permit2data", "/v1/namehash", "/v1/x402req"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/permitdata": permitdata, "/v1/permit2data": permit2data, "/v1/namehash": namehash, "/v1/x402req": x402req })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/sigformat", "/v1/selectors", "/v1/codemeta", "/v1/aeropool"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/sigformat": sigformat, "/v1/selectors": selectors, "/v1/codemeta": codemeta, "/v1/aeropool": aeropool })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/createaddr", "/v1/revokebuild", "/v1/transferbuild", "/v1/cometpos"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/createaddr": createaddr, "/v1/revokebuild": revokebuild, "/v1/transferbuild": transferbuild, "/v1/cometpos": cometpos })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/wrapbuild", "/v1/multisend", "/v1/aavebuild", "/v1/rlpcodec"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/wrapbuild": wrapbuild, "/v1/multisend": multisend, "/v1/aavebuild": aavebuild, "/v1/rlpcodec": rlpcodec })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/approvebuild", "/v1/nftsendbuild", "/v1/ethsendbuild", "/v1/cometbuild"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/approvebuild": approvebuild, "/v1/nftsendbuild": nftsendbuild, "/v1/ethsendbuild": ethsendbuild, "/v1/cometbuild": cometbuild })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/swapbuild", "/v1/vaultbuild", "/v1/accesslist", "/v1/permit2build"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/swapbuild": swapbuild, "/v1/vaultbuild": vaultbuild, "/v1/accesslist": accesslist, "/v1/permit2build": permit2build })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/aeroswap", "/v1/cometrewards", "/v1/authhash", "/v1/canceltx"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/aeroswap": aeroswap, "/v1/cometrewards": cometrewards, "/v1/authhash": authhash, "/v1/canceltx": canceltx })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/payoutbatch", "/v1/safeexec", "/v1/morphobuild", "/v1/pullbuild"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/payoutbatch": payoutbatch, "/v1/safeexec": safeexec, "/v1/morphobuild": morphobuild, "/v1/pullbuild": pullbuild })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/nativesweep", "/v1/tokensweep", "/v1/delegatebuild", "/v1/wstethbuild"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/nativesweep": nativesweep, "/v1/tokensweep": tokensweep, "/v1/delegatebuild": delegatebuild, "/v1/wstethbuild": wstethbuild })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/create2deploy", "/v1/ethairdrop", "/v1/lpcollect", "/v1/permitsubmit"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/create2deploy": create2deploy, "/v1/ethairdrop": ethairdrop, "/v1/lpcollect": lpcollect, "/v1/permitsubmit": permitsubmit })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/tokenairdrop", "/v1/safeownerbuild", "/v1/nonceclear", "/v1/cctpburn"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/tokenairdrop": tokenairdrop, "/v1/safeownerbuild": safeownerbuild, "/v1/nonceclear": nonceclear, "/v1/cctpburn": cctpburn })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/l2deposit", "/v1/l2withdraw", "/v1/sendcalls", "/v1/safecreate"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/l2deposit": l2deposit, "/v1/l2withdraw": l2withdraw, "/v1/sendcalls": sendcalls, "/v1/safecreate": safecreate })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/erc1155send", "/v1/nftapprovalall", "/v1/permit2lockdown", "/v1/cancelauth"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/erc1155send": erc1155send, "/v1/nftapprovalall": nftapprovalall, "/v1/permit2lockdown": permit2lockdown, "/v1/cancelauth": cancelauth })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/acrossdeposit", "/v1/lidowithdraw", "/v1/lidoclaim", "/v1/permit2nonce"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/acrossdeposit": acrossdeposit, "/v1/lidowithdraw": lidowithdraw, "/v1/lidoclaim": lidoclaim, "/v1/permit2nonce": permit2nonce })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/supplysiderev", "/v1/optionspremium", "/v1/lnnodehist", "/v1/solsupply"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/supplysiderev": supplysiderev, "/v1/optionspremium": optionspremium, "/v1/lnnodehist": lnnodehist, "/v1/solsupply": solsupply })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/cowquote", "/v1/cowstatus", "/v1/cowcancel", "/v1/cowpresign"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/cowquote": cowquote, "/v1/cowstatus": cowstatus, "/v1/cowcancel": cowcancel, "/v1/cowpresign": cowpresign })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/optionsnotional", "/v1/perpaggs", "/v1/perpoi", "/v1/solstakerewards"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/optionsnotional": optionsnotional, "/v1/perpaggs": perpaggs, "/v1/perpoi": perpoi, "/v1/solstakerewards": solstakerewards })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/kyberswap", "/v1/veloraswap", "/v1/lifiquote", "/v1/swapbest"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/kyberswap": kyberswap, "/v1/veloraswap": veloraswap, "/v1/lifiquote": lifiquote, "/v1/swapbest": swapbest })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/mcaptvl", "/v1/categorymcap", "/v1/multichain", "/v1/solblock"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/mcaptvl": mcaptvl, "/v1/categorymcap": categorymcap, "/v1/multichain": multichain, "/v1/solblock": solblock })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/relayquote", "/v1/relaystatus", "/v1/dlnorder", "/v1/dlnstatus"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/relayquote": relayquote, "/v1/relaystatus": relaystatus, "/v1/dlnorder": dlnorder, "/v1/dlnstatus": dlnstatus })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/btcblockaudit", "/v1/btcauditscores", "/v1/btcpredictions", "/v1/btcpoolaudit"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/btcblockaudit": btcblockaudit, "/v1/btcauditscores": btcauditscores, "/v1/btcpredictions": btcpredictions, "/v1/btcpoolaudit": btcpoolaudit })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/acrossstatus", "/v1/acrosslimits", "/v1/cctpmint", "/v1/cctpfee"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/acrossstatus": acrossstatus, "/v1/acrosslimits": acrosslimits, "/v1/cctpmint": cctpmint, "/v1/cctpfee": cctpfee })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/lnchannel", "/v1/lnfees", "/v1/solleaderslots", "/v1/soltxcount"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/lnchannel": lnchannel, "/v1/lnfees": lnfees, "/v1/solleaderslots": solleaderslots, "/v1/soltxcount": soltxcount })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/yieldpredict", "/v1/yieldsharpe", "/v1/yieldmovers", "/v1/yieldtoken"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/yieldpredict": yieldpredict, "/v1/yieldsharpe": yieldsharpe, "/v1/yieldmovers": yieldmovers, "/v1/yieldtoken": yieldtoken })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/lifistatus", "/v1/lifiroutes", "/v1/lifirefuel", "/v1/lzmessage"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/lifistatus": lifistatus, "/v1/lifiroutes": lifiroutes, "/v1/lifirefuel": lifirefuel, "/v1/lzmessage": lzmessage })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/yieldlp", "/v1/yieldrewards", "/v1/yieldprojects", "/v1/yieldchains"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/yieldlp": yieldlp, "/v1/yieldrewards": yieldrewards, "/v1/yieldprojects": yieldprojects, "/v1/yieldchains": yieldchains })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/whstatus", "/v1/whvaa", "/v1/axelarstatus", "/v1/axelargas"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/whstatus": whstatus, "/v1/whvaa": whvaa, "/v1/axelarstatus": axelarstatus, "/v1/axelargas": axelargas })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/lngeo", "/v1/lnfeatures", "/v1/btcrewardhist", "/v1/solstakeparams"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/lngeo": lngeo, "/v1/lnfeatures": lnfeatures, "/v1/btcrewardhist": btcrewardhist, "/v1/solstakeparams": solstakeparams })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/mayanquote", "/v1/mayanstatus", "/v1/symbiosisswap", "/v1/symbiosisstatus"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/mayanquote": mayanquote, "/v1/mayanstatus": mayanstatus, "/v1/symbiosisswap": symbiosisswap, "/v1/symbiosisstatus": symbiosisstatus })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/solshield", "/v1/jupholdings", "/v1/juplimitorders", "/v1/jupdca"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/solshield": solshield, "/v1/jupholdings": jupholdings, "/v1/juplimitorders": juplimitorders, "/v1/jupdca": jupdca })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/juplend", "/v1/juplendpos", "/v1/juplst", "/v1/jupdexlabels"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/juplend": juplend, "/v1/juplendpos": juplendpos, "/v1/juplst": juplst, "/v1/jupdexlabels": jupdexlabels })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/pendlemarkets", "/v1/pendleswap", "/v1/pendlepositions", "/v1/balancerquote"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/pendlemarkets": pendlemarkets, "/v1/pendleswap": pendleswap, "/v1/pendlepositions": pendlepositions, "/v1/balancerquote": balancerquote })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/curvepools", "/v1/curvelend", "/v1/curveswap", "/v1/crvusdmarkets"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/curvepools": curvepools, "/v1/curvelend": curvelend, "/v1/curveswap": curveswap, "/v1/crvusdmarkets": crvusdmarkets })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/treasuryrev", "/v1/userfees", "/v1/feecats", "/v1/feehist"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/treasuryrev": treasuryrev, "/v1/userfees": userfees, "/v1/feecats": feecats, "/v1/feehist": feehist })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/yearnvaults", "/v1/yearnbuild", "/v1/beefyvaults", "/v1/beefybuild"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/yearnvaults": yearnvaults, "/v1/yearnbuild": yearnbuild, "/v1/beefyvaults": beefyvaults, "/v1/beefybuild": beefybuild })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/jupborrow", "/v1/jupborrowcap", "/v1/soltokenbal", "/v1/btcblockattime"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/jupborrow": jupborrow, "/v1/jupborrowcap": jupborrowcap, "/v1/soltokenbal": soltokenbal, "/v1/btcblockattime": btcblockattime })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/savingsrates", "/v1/savingsbuild", "/v1/susdecooldown", "/v1/usdsconvert"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/savingsrates": savingsrates, "/v1/savingsbuild": savingsbuild, "/v1/susdecooldown": susdecooldown, "/v1/usdsconvert": usdsconvert })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/prottokens", "/v1/protchaintvl", "/v1/protraises", "/v1/chaintvlhist"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/prottokens": prottokens, "/v1/protchaintvl": protchaintvl, "/v1/protraises": protraises, "/v1/chaintvlhist": chaintvlhist })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/fluidlend", "/v1/fluidbuild", "/v1/fluidvaults", "/v1/fluidpositions"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/fluidlend": fluidlend, "/v1/fluidbuild": fluidbuild, "/v1/fluidvaults": fluidvaults, "/v1/fluidpositions": fluidpositions })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/merklrewards", "/v1/merklclaim", "/v1/merklopps", "/v1/morphovaults"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/merklrewards": merklrewards, "/v1/merklclaim": merklclaim, "/v1/merklopps": merklopps, "/v1/morphovaults": morphovaults })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/prottvlhist", "/v1/prothallmarks", "/v1/defitvlhist", "/v1/protcompare"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/prottvlhist": prottvlhist, "/v1/prothallmarks": prothallmarks, "/v1/defitvlhist": defitvlhist, "/v1/protcompare": protcompare })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/uniquote", "/v1/uniswapbuild", "/v1/unipools", "/v1/uniposition"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/uniquote": uniquote, "/v1/uniswapbuild": uniswapbuild, "/v1/unipools": unipools, "/v1/uniposition": uniposition })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/moonwellmarkets", "/v1/moonwellposition", "/v1/moonwellbuild", "/v1/moonwellenter"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/moonwellmarkets": moonwellmarkets, "/v1/moonwellposition": moonwellposition, "/v1/moonwellbuild": moonwellbuild, "/v1/moonwellenter": moonwellenter })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/pricebatchhist", "/v1/pricelookback", "/v1/solblockrange", "/v1/soltokenacct"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/pricebatchhist": pricebatchhist, "/v1/pricelookback": pricelookback, "/v1/solblockrange": solblockrange, "/v1/soltokenacct": soltokenacct })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/aavemarkets", "/v1/sparkmarkets", "/v1/sparkposition", "/v1/sparkbuild"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/aavemarkets": aavemarkets, "/v1/sparkmarkets": sparkmarkets, "/v1/sparkposition": sparkposition, "/v1/sparkbuild": sparkbuild })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/protdexvol", "/v1/protoptionsvol", "/v1/stablecoindetail", "/v1/stabledepegs"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/protdexvol": protdexvol, "/v1/protoptionsvol": protoptionsvol, "/v1/stablecoindetail": stablecoindetail, "/v1/stabledepegs": stabledepegs })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/eulervaults", "/v1/eulervault", "/v1/eulerposition", "/v1/eulerbuild"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/eulervaults": eulervaults, "/v1/eulervault": eulervault, "/v1/eulerposition": eulerposition, "/v1/eulerbuild": eulerbuild })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/rethstats", "/v1/rethbuild", "/v1/weethstats", "/v1/weethbuild"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/rethstats": rethstats, "/v1/rethbuild": rethbuild, "/v1/weethstats": weethstats, "/v1/weethbuild": weethbuild })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/dvol", "/v1/optionsoi", "/v1/maxpain", "/v1/perpfundhist"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/dvol": dvol, "/v1/optionsoi": optionsoi, "/v1/maxpain": maxpain, "/v1/perpfundhist": perpfundhist })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/realizedvol", "/v1/futuresbasis", "/v1/optionsflow", "/v1/ivsmile"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/realizedvol": realizedvol, "/v1/futuresbasis": futuresbasis, "/v1/optionsflow": optionsflow, "/v1/ivsmile": ivsmile })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/v4pools", "/v1/v4quote", "/v1/v4swapbuild", "/v1/v4position"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/v4pools": v4pools, "/v1/v4quote": v4quote, "/v1/v4swapbuild": v4swapbuild, "/v1/v4position": v4position })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/obdepth", "/v1/krakenohlc", "/v1/cexspread", "/v1/krakenpair"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/obdepth": obdepth, "/v1/krakenohlc": krakenohlc, "/v1/cexspread": cexspread, "/v1/krakenpair": krakenpair })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/skysavings", "/v1/skysavingsbuild", "/v1/savingsposition", "/v1/susdestats"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/skysavings": skysavings, "/v1/skysavingsbuild": skysavingsbuild, "/v1/savingsposition": savingsposition, "/v1/susdestats": susdestats })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/cexarb", "/v1/cexvolume", "/v1/deribitsettle", "/v1/krakentrades"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/cexarb": cexarb, "/v1/cexvolume": cexvolume, "/v1/deribitsettle": deribitsettle, "/v1/krakentrades": krakentrades })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/v2pair", "/v1/v2quote", "/v1/v2swapbuild", "/v1/v2lp"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/v2pair": v2pair, "/v1/v2quote": v2quote, "/v1/v2swapbuild": v2swapbuild, "/v1/v2lp": v2lp })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/morphoposition", "/v1/morphomarket", "/v1/morphovault", "/v1/morphovaultpos"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/morphoposition": morphoposition, "/v1/morphomarket": morphomarket, "/v1/morphovault": morphovault, "/v1/morphovaultpos": morphovaultpos })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/cbcandles", "/v1/bitstampbook", "/v1/stablepxhist", "/v1/soltxstatus"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/cbcandles": cbcandles, "/v1/bitstampbook": bitstampbook, "/v1/stablepxhist": stablepxhist, "/v1/soltxstatus": soltxstatus })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/easattest", "/v1/easschema", "/v1/easattestbuild", "/v1/easrevokebuild"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/easattest": easattest, "/v1/easschema": easschema, "/v1/easattestbuild": easattestbuild, "/v1/easrevokebuild": easrevokebuild })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/cbtrades", "/v1/bitstampohlc", "/v1/krakenspreadhist", "/v1/deribitfutflow"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/cbtrades": cbtrades, "/v1/bitstampohlc": bitstampohlc, "/v1/krakenspreadhist": krakenspreadhist, "/v1/deribitfutflow": deribitfutflow })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/balancerpools", "/v1/balancerpool", "/v1/balancerposition", "/v1/balancerswapbuild"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/balancerpools": balancerpools, "/v1/balancerpool": balancerpool, "/v1/balancerposition": balancerposition, "/v1/balancerswapbuild": balancerswapbuild })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/okxfunding", "/v1/okxlongshort", "/v1/geminibook", "/v1/kucoinstats"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/okxfunding": okxfunding, "/v1/okxlongshort": okxlongshort, "/v1/geminibook": geminibook, "/v1/kucoinstats": kucoinstats })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/aerogauge", "/v1/aerostake", "/v1/aeroclaimbuild", "/v1/aerolock"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/aerogauge": aerogauge, "/v1/aerostake": aerostake, "/v1/aeroclaimbuild": aeroclaimbuild, "/v1/aerolock": aerolock })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/okxoi", "/v1/okxtakervol", "/v1/bfxfunding", "/v1/kucoinbook"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/okxoi": okxoi, "/v1/okxtakervol": okxtakervol, "/v1/bfxfunding": bfxfunding, "/v1/kucoinbook": kucoinbook })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/gmxmarkets", "/v1/gmxprices", "/v1/gmxglv", "/v1/gmxlp"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/gmxmarkets": gmxmarkets, "/v1/gmxprices": gmxprices, "/v1/gmxglv": gmxglv, "/v1/gmxlp": gmxlp })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/bfxpositions", "/v1/geminitrades", "/v1/kucoinfunding", "/v1/bfxticker"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/bfxpositions": bfxpositions, "/v1/geminitrades": geminitrades, "/v1/kucoinfunding": kucoinfunding, "/v1/bfxticker": bfxticker })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/dydxmarkets", "/v1/dydxbook", "/v1/dydxfunding", "/v1/dydxcandles"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/dydxmarkets": dydxmarkets, "/v1/dydxbook": dydxbook, "/v1/dydxfunding": dydxfunding, "/v1/dydxcandles": dydxcandles })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/geminicandles", "/v1/kucoinohlc", "/v1/okxohlc", "/v1/bfxohlc"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/geminicandles": geminicandles, "/v1/kucoinohlc": kucoinohlc, "/v1/okxohlc": okxohlc, "/v1/bfxohlc": bfxohlc })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/pmbook", "/v1/pmhistory", "/v1/pmholders", "/v1/pmpositions"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/pmbook": pmbook, "/v1/pmhistory": pmhistory, "/v1/pmholders": pmholders, "/v1/pmpositions": pmpositions })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/kucointrades", "/v1/okxtrades", "/v1/bfxtrades", "/v1/okxtickers"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/kucointrades": kucointrades, "/v1/okxtrades": okxtrades, "/v1/bfxtrades": bfxtrades, "/v1/okxtickers": okxtickers })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/kalshimarket", "/v1/kalshibook", "/v1/kalshitrades", "/v1/kalshicandles"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/kalshimarket": kalshimarket, "/v1/kalshibook": kalshibook, "/v1/kalshitrades": kalshitrades, "/v1/kalshicandles": kalshicandles })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/blockbytime", "/v1/supplyat", "/v1/codematch", "/v1/l1fee"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/blockbytime": blockbytime, "/v1/supplyat": supplyat, "/v1/codematch": codematch, "/v1/l1fee": l1fee })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/hlbook", "/v1/hlcandles", "/v1/hlspot", "/v1/fundinghist"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/hlbook": hlbook, "/v1/hlcandles": hlcandles, "/v1/hlspot": hlspot, "/v1/fundinghist": fundinghist })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/cctpflows", "/v1/perpfunding", "/v1/dexboosts", "/v1/hlaccount"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/cctpflows": cctpflows, "/v1/perpfunding": perpfunding, "/v1/dexboosts": dexboosts, "/v1/hlaccount": hlaccount })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/hltrades", "/v1/hlorders", "/v1/hlvault", "/v1/cctpinflows"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/hltrades": hltrades, "/v1/hlorders": hlorders, "/v1/hlvault": hlvault, "/v1/cctpinflows": cctpinflows })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/hlfills", "/v1/hlfundpay", "/v1/hlstake", "/v1/dexsearch"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/hlfills": hlfills, "/v1/hlfundpay": hlfundpay, "/v1/hlstake": hlstake, "/v1/dexsearch": dexsearch })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/hlledger", "/v1/hlpnl", "/v1/hltwap", "/v1/hloi"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/hlledger": hlledger, "/v1/hlpnl": hlpnl, "/v1/hltwap": hltwap, "/v1/hloi": hloi })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/hlspotbal", "/v1/hlfees", "/v1/hlidentity", "/v1/hlvaultpos"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/hlspotbal": hlspotbal, "/v1/hlfees": hlfees, "/v1/hlidentity": hlidentity, "/v1/hlvaultpos": hlvaultpos })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/fundingarb", "/v1/tokenpairs", "/v1/protocolfees", "/v1/feesrank"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/fundingarb": fundingarb, "/v1/tokenpairs": tokenpairs, "/v1/protocolfees": protocolfees, "/v1/feesrank": feesrank })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/optionsrank", "/v1/pricechange", "/v1/yieldhist", "/v1/tokenlaunch"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/optionsrank": optionsrank, "/v1/pricechange": pricechange, "/v1/yieldhist": yieldhist, "/v1/tokenlaunch": tokenlaunch })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/hip3dexs", "/v1/hip3markets", "/v1/hlauction", "/v1/hltoken"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/hip3dexs": hip3dexs, "/v1/hip3markets": hip3markets, "/v1/hlauction": hlauction, "/v1/hltoken": hltoken })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/stablechains", "/v1/stableflows", "/v1/chaindexvol", "/v1/hlvalidators"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/stablechains": stablechains, "/v1/stableflows": stableflows, "/v1/chaindexvol": chaindexvol, "/v1/hlvalidators": hlvalidators })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/tokenvol", "/v1/tokencorr", "/v1/stableyields", "/v1/categorytvl"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/tokenvol": tokenvol, "/v1/tokencorr": tokencorr, "/v1/stableyields": stableyields, "/v1/categorytvl": categorytvl })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/solquote", "/v1/solprio", "/v1/solepoch", "/v1/btcpools"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/solquote": solquote, "/v1/solprio": solprio, "/v1/solepoch": solepoch, "/v1/btcpools": btcpools })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/solvalidators", "/v1/solactivity", "/v1/btcdiff", "/v1/btcrewards"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/solvalidators": solvalidators, "/v1/solactivity": solactivity, "/v1/btcdiff": btcdiff, "/v1/btcrewards": btcrewards })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/btcutxo", "/v1/btcblock", "/v1/btcrbf", "/v1/btcpool"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/btcutxo": btcutxo, "/v1/btcblock": btcblock, "/v1/btcrbf": btcrbf, "/v1/btcpool": btcpool })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/solprice", "/v1/soltoken", "/v1/soltrending", "/v1/solinflation"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/solprice": solprice, "/v1/soltoken": soltoken, "/v1/soltrending": soltrending, "/v1/solinflation": solinflation })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/btcmempool", "/v1/btchalving", "/v1/solnewtokens", "/v1/btccpfp"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/btcmempool": btcmempool, "/v1/btchalving": btchalving, "/v1/solnewtokens": solnewtokens, "/v1/btccpfp": btccpfp })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/btcaddress", "/v1/btchashrate", "/v1/btcfeehist", "/v1/soltoptraded"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/btcaddress": btcaddress, "/v1/btchashrate": btchashrate, "/v1/btcfeehist": btcfeehist, "/v1/soltoptraded": soltoptraded })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/btclightning", "/v1/lnnodes", "/v1/btcblockfees", "/v1/solimpact"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/btclightning": btclightning, "/v1/lnnodes": lnnodes, "/v1/btcblockfees": btcblockfees, "/v1/solimpact": solimpact })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/btcminerrev", "/v1/btcblocksize", "/v1/lncountries", "/v1/lnisps"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/btcminerrev": btcminerrev, "/v1/btcblocksize": btcblocksize, "/v1/lncountries": lncountries, "/v1/lnisps": lnisps })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/lnnode", "/v1/btcrecenttx", "/v1/solverified", "/v1/btcfeecalc"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/lnnode": lnnode, "/v1/btcrecenttx": btcrecenttx, "/v1/solverified": solverified, "/v1/btcfeecalc": btcfeecalc })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/lnchannels", "/v1/blockattime", "/v1/tokenchange", "/v1/btchistprice"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/lnchannels": lnchannels, "/v1/blockattime": blockattime, "/v1/tokenchange": tokenchange, "/v1/btchistprice": btchistprice })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/tokenfirstprice", "/v1/soltps", "/v1/stablehist", "/v1/tokendrawdown"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/tokenfirstprice": tokenfirstprice, "/v1/soltps": soltps, "/v1/stablehist": stablehist, "/v1/tokendrawdown": tokendrawdown })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/solskiprate", "/v1/soltxhist", "/v1/solaccount", "/v1/solblocktime"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/solskiprate": solskiprate, "/v1/soltxhist": soltxhist, "/v1/solaccount": solaccount, "/v1/solblocktime": solblocktime })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/solleaders", "/v1/solversions", "/v1/solbalances", "/v1/lnsearch"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/solleaders": solleaders, "/v1/solversions": solversions, "/v1/solbalances": solbalances, "/v1/lnsearch": lnsearch })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/btcrecentblocks", "/v1/btcpooldom", "/v1/btcoutspends", "/v1/btcvalidate"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/btcrecentblocks": btcrecentblocks, "/v1/btcpooldom": btcpooldom, "/v1/btcoutspends": btcoutspends, "/v1/btcvalidate": btcvalidate })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/dexaggs", "/v1/bridgeaggs", "/v1/aggshare", "/v1/lncountry"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/dexaggs": dexaggs, "/v1/bridgeaggs": bridgeaggs, "/v1/aggshare": aggshare, "/v1/lncountry": lncountry })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/lnveterans", "/v1/optionsvol", "/v1/holdersrevenue", "/v1/lnisp"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/lnveterans": lnveterans, "/v1/optionsvol": optionsvol, "/v1/holdersrevenue": holdersrevenue, "/v1/lnisp": lnisp })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/protocolrevenue", "/v1/takerate", "/v1/lnconnected", "/v1/lnliquidity"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/protocolrevenue": protocolrevenue, "/v1/takerate": takerate, "/v1/lnconnected": lnconnected, "/v1/lnliquidity": lnliquidity })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/feegrowth", "/v1/revenuegrowth", "/v1/dexgrowth", "/v1/categoryfees"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/feegrowth": feegrowth, "/v1/revenuegrowth": revenuegrowth, "/v1/dexgrowth": dexgrowth, "/v1/categoryfees": categoryfees })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (["/v1/poolhashrate", "/v1/btcdiffadj", "/v1/stabledominance", "/v1/stablegrowth"].includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {
      let a = Object.fromEntries(url.searchParams);
      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }
      const o = await ({ "/v1/poolhashrate": poolhashrate, "/v1/btcdiffadj": btcdiffadj, "/v1/stabledominance": stabledominance, "/v1/stablegrowth": stablegrowth })[url.pathname](a); res = J(o.body, o.status);
    }
    else if (url.pathname === "/v1/batch" && req.method === "POST") { let b = null; try { b = await req.json(); } catch {} const o = await batch(b); res = J(o.body, o.status); }
    else res = J({ error: "not found" }, 404);
  } catch (e) { res = J({ error: "upstream_error", detail: String(e.message || e).slice(0, 160) }, 502); }
  if (req.__pay) {
    if (res.ok) {
      const st = await settlePayment(req.__pay.cfg, req.__pay.payload, req.__pay.reqs, req.__pay.version);
      if (env.DB) { try { await env.DB.prepare("INSERT INTO payments (ts,route,network,payer,amount_atomic,tx,ok,payment_class) VALUES (?,?,?,?,?,?,?,?)").bind(new Date().toISOString(), url.pathname, req.__pay.cfg.network, req.__pay.from, req.__pay.cfg.atomic, st.tx || "", st.ok ? 1 : 0, req.__pay.self ? "SELF_GENERATED" : "EXTERNAL").run(); } catch {} }
      const P = req.__pay;
      if (st.ok) { res = new Response(res.body, res); res.headers.set(P.version === 2 ? "payment-response" : "x-payment-response", st.header); res.headers.set("access-control-expose-headers", P.version === 2 ? "PAYMENT-RESPONSE" : "x-payment-response"); }
      else res = J({ x402Version: 1, error: "settlement_failed", reason: st.reason, accepts: [P.v1reqs] }, 402, v2Headers(P.cfg, P.resource, P.desc, "settlement_failed: " + st.reason));
    }
  }
  try { await logCall(env, req, url, res.status, started, ipHash); } catch {}
  return res;
}
export default { fetch: handle, scheduled };

import test from "node:test"; import assert from "node:assert/strict";
import { handle } from "../src/index.js";
import { PAID_PATHS } from "../src/x402.js";
import { parseRss, shapeMarket, uptime, weather, blocktime, dexquote } from "../src/packb.js";
const R = ["/v1/polymarket", "/v1/blocktime", "/v1/weather", "/v1/uptime", "/v1/cryptonews", "/v1/yieldpools", "/v1/dexquote"];
const env = { BEGGAR_DEMAND_TESTS_ENABLED: "true", X402_MODE: "mainnet", X402_MAINNET_ALLOWED: "true", X402_PRICE_USD: "0.02", X402_PAY_TO: "0x719227f384b66BFEF00093D6d8d32fA9dC2B40e7", X402_FACILITATOR_URL: "https://fac.test" };
test("packb: paid 402 at 20000", async () => {
  for (const p of R) { assert.ok(PAID_PATHS.has(p), p); const r = await handle(new Request("https://w.test" + p), env); assert.equal(r.status, 402, p); assert.match(JSON.stringify(await r.json()), /20000/); }
});
test("packb: pure helpers + validation", async () => {
  const it = parseRss(`<rss><item><title><![CDATA[Bitcoin &amp; ETH]]></title><link>https://x.y/a</link><pubDate>Mon, 02 Nov 2026 09:00:00 GMT</pubDate></item></rss>`, "t");
  assert.equal(it[0].title, "Bitcoin & ETH"); assert.equal(it[0].published, "2026-11-02T09:00:00.000Z");
  const m = shapeMarket({ question: "Q", outcomes: '["Yes","No"]', outcomePrices: '["0.25","0.75"]', slug: "q" }); assert.equal(m.outcomes[0].implied_pct, 25);
  assert.equal((await uptime({})).status, 400); assert.equal((await uptime({ urls: "http://127.0.0.1" })).body.results[0].error, "blocked_or_invalid_url");
  assert.equal((await weather({ lat: 999, lon: 0 })).status, 400); assert.equal((await blocktime({})).status, 400); assert.equal((await dexquote({ token_in: "x", token_out: "USDC", chain: "base" })).status, 502 - 102);
});
import { fxrate, oracleprice } from "../src/packb2.js";
test("packb2: paid 402 + validation", async () => {
  for (const p of ["/v1/pegcheck", "/v1/oracleprice", "/v1/fxrate"]) { assert.ok(PAID_PATHS.has(p)); assert.equal((await handle(new Request("https://w.test" + p), env)).status, 402); }
  assert.equal((await fxrate({ base: "us" })).status, 400); assert.equal((await oracleprice({ pairs: "FOO/BAR" })).status, 400); assert.equal((await oracleprice({ chain: "solana" })).status, 400);
});
import { namesbatch } from "../src/packb3.js";
test("packb3: paid 402 + validation", async () => {
  for (const p of ["/v1/namesbatch", "/v1/sentiment"]) { assert.ok(PAID_PATHS.has(p)); assert.equal((await handle(new Request("https://w.test" + p), env)).status, 402); }
  assert.equal((await namesbatch({})).status, 400); assert.equal((await namesbatch({ addresses: "0x12" })).status, 400);
});
import { chaininfo, tokenlist } from "../src/packb5.js";
test("packb5: paid 402 + validation", async () => {
  for (const p of ["/v1/chaininfo", "/v1/tokenlist", "/v1/gascompare"]) { assert.ok(PAID_PATHS.has(p)); assert.equal((await handle(new Request("https://w.test" + p), env)).status, 402); }
  assert.equal((await chaininfo({})).status, 400); assert.equal((await tokenlist({})).status, 400); assert.equal((await tokenlist({ token: "0x12" })).status, 400);
});
import { verified, fnsig } from "../src/packb6.js";
test("packb6: paid 402 + validation", async () => {
  for (const p of ["/v1/verified", "/v1/fnsig", "/v1/hacks", "/v1/trending"]) { assert.ok(PAID_PATHS.has(p)); assert.equal((await handle(new Request("https://w.test" + p), env)).status, 402); }
  assert.equal((await verified({})).status, 400); assert.equal((await fnsig({})).status, 400); assert.equal((await fnsig({ selectors: "0x12" })).status, 400);
});
import { coinsearch, osvcheck, pkginfo } from "../src/packb7.js";
test("packb7: paid 402 + validation", async () => {
  for (const p of ["/v1/coinsearch", "/v1/pricehistory", "/v1/osvcheck", "/v1/pkginfo"]) { assert.ok(PAID_PATHS.has(p)); assert.equal((await handle(new Request("https://w.test" + p), env)).status, 402); }
  assert.equal((await coinsearch({})).status, 400); assert.equal((await osvcheck({})).status, 400); assert.equal((await pkginfo({})).status, 400);
});
import { holidays, wiki, arxiv } from "../src/packb8.js";
test("packb8: paid 402 + validation", async () => {
  for (const p of ["/v1/holidays", "/v1/wiki", "/v1/arxiv", "/v1/hnsearch"]) { assert.ok(PAID_PATHS.has(p)); assert.equal((await handle(new Request("https://w.test" + p), env)).status, 402); }
  assert.equal((await holidays({ country: "GBR" })).status, 400); assert.equal((await wiki({})).status, 400); assert.equal((await arxiv({})).status, 400);
});
import { transfers, ensrecords, readcontract, nativebalances } from "../src/packb9.js";
test("packb9: paid 402 + validation", async () => {
  for (const p of ["/v1/transfers", "/v1/ensrecords", "/v1/readcontract", "/v1/nativebalances"]) { assert.ok(PAID_PATHS.has(p)); assert.equal((await handle(new Request("https://w.test" + p), env)).status, 402); }
  assert.equal((await transfers({})).status, 400); assert.equal((await ensrecords({ name: "x" })).status, 400); assert.equal((await readcontract({})).status, 400); assert.equal((await nativebalances({ address: "0x1" })).status, 400);
  assert.equal((await readcontract({ to: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", sig: "balanceOf(address)(uint256)" })).status, 400);
});

test("packb10 paid 402 + validation", async () => {
  for (const p of ["/v1/contractage", "/v1/walletage", "/v1/approvals", "/v1/usdcauth"]) assert.ok(PAID_PATHS.has(p));
  const m = await import("../src/packb10.js");
  assert.equal((await m.contractage({})).status, 400);
  assert.equal((await m.walletage({ address: "x" })).status, 400);
  assert.equal((await m.approvals({ owner: "0x1" })).status, 400);
  assert.equal((await m.usdcauth({ authorizer: "0x719227f384b66BFEF00093D6d8d32fA9dC2B40e7", nonces: "0x12" })).status, 400);
});

test("packb11 paid 402 + validation", async () => {
  for (const p of ["/v1/balanceat", "/v1/nftowner", "/v1/mintburn", "/v1/txfees"]) assert.ok(PAID_PATHS.has(p));
  const m = await import("../src/packb11.js");
  assert.equal((await m.balanceat({ address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" })).status, 400);
  assert.equal((await m.nftowner({ contract: "0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D" })).status, 400);
  assert.equal((await m.mintburn({})).status, 400);
  assert.equal((await m.txfees({ txs: "0x12" })).status, 400);
});

test("packb12 paid 402 + validation", async () => {
  for (const p of ["/v1/permit2", "/v1/storageslot", "/v1/cctpstatus", "/v1/bridgequote"]) assert.ok(PAID_PATHS.has(p));
  const m = await import("../src/packb12.js");
  assert.equal((await m.permit2({ owner: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" })).status, 400);
  assert.equal((await m.storageslot({ contract: "bad" })).status, 400);
  assert.equal((await m.cctpstatus({ source: "base" })).status, 400);
  assert.equal((await m.bridgequote({ from: "base", to: "base" })).status, 400);
});

test("packb13 paid 402 + validation", async () => {
  for (const p of ["/v1/finality", "/v1/facilitators", "/v1/gasrunway", "/v1/admins"]) assert.ok(PAID_PATHS.has(p));
  const m = await import("../src/packb13.js");
  assert.equal((await m.finality({ chain: "base" })).status, 400);
  assert.equal((await m.gasrunway({ address: "x" })).status, 400);
  assert.equal((await m.admins({})).status, 400);
});

test("packb14 paid 402 + validation", async () => {
  for (const p of ["/v1/blockbytime", "/v1/supplyat", "/v1/codematch", "/v1/l1fee"]) assert.ok(PAID_PATHS.has(p));
  const m = await import("../src/packb14.js");
  assert.equal((await m.blockbytime({})).status, 400);
  assert.equal((await m.supplyat({ token: "x" })).status, 400);
  assert.equal((await m.codematch({})).status, 400);
  assert.equal((await m.l1fee({ chain: "polygon" })).status, 400);
});

test("packb16 paid 402 + validation", async () => {
  for (const p of ["/v1/sanctioned", "/v1/usdtblacklist", "/v1/lpposition", "/v1/rpchealth"]) assert.ok(PAID_PATHS.has(p));
  const m = await import("../src/packb16.js");
  assert.equal((await m.sanctioned({})).status, 400);
  assert.equal((await m.usdtblacklist({ address: "x" })).status, 400);
  assert.equal((await m.lpposition({ chain: "base" })).status, 400);
  assert.equal((await m.rpchealth({ chains: "zzz" })).status, 400);
});

test("packb15 paid 402 + validation", async () => {
  for (const p of ["/v1/noncegap", "/v1/priceat", "/v1/paymaster", "/v1/usdcblacklist"]) assert.ok(PAID_PATHS.has(p));
  const m = await import("../src/packb15.js");
  assert.equal((await m.noncegap({})).status, 400);
  assert.equal((await m.priceat({ pair: "XYZ/USD" })).status, 400);
  assert.equal((await m.paymaster({})).status, 400);
  assert.equal((await m.usdcblacklist({ address: "x" })).status, 400);
});

test("packb17 paid 402 + validation + create2 vector", async () => {
  for (const p of ["/v1/sig1271", "/v1/compound", "/v1/create2", "/v1/feedhealth"]) assert.ok(PAID_PATHS.has(p));
  const m = await import("../src/packb17.js");
  assert.equal((await m.sig1271({})).status, 400);
  assert.equal((await m.compound({ chain: "zzz" })).status, 400);
  assert.equal((await m.feedhealth({ chain: "zzz" })).status, 400);
  // EIP-1014 example 0
  const r = await m.create2({ deployer: "0x0000000000000000000000000000000000000000", salt: "0x00", init_code: "0x00" });
  assert.equal(r.body.address, "0x4D1A2e2bB4F88F0250f26Ffff098B0b30B26BF38");
});

test("packb18 paid + validation", async () => {
  for (const p of ["/v1/eip7702", "/v1/accountkind", "/v1/erc165", "/v1/blockhash"]) assert.ok(PAID_PATHS.has(p));
  const m = await import("../src/packb18.js");
  assert.equal((await m.eip7702({})).status, 400);
  assert.equal((await m.accountkind({ addresses: "0x1" })).status, 400);
  assert.equal((await m.erc165({ address: "0x0000000000000000000000000000000000000001", interface_ids: "zz" })).status, 400);
  assert.equal((await m.blockhash({ blocks: "abc" })).status, 400);
});

test("packb19 paid + validation", async () => {
  for (const p of ["/v1/aanonce", "/v1/transfersim", "/v1/paused", "/v1/tokenbatch"]) assert.ok(PAID_PATHS.has(p));
  const m = await import("../src/packb19.js");
  assert.equal((await m.aanonce({})).status, 400);
  assert.equal((await m.transfersim({ from: "0x1" })).status, 400);
  assert.equal((await m.paused({ contracts: "nope" })).status, 400);
  assert.equal((await m.tokenbatch({})).status, 400);
});

test("packb20 paid + validation", async () => {
  for (const p of ["/v1/txbatch", "/v1/balancediff", "/v1/eip712domain", "/v1/basefeenext"]) assert.ok(PAID_PATHS.has(p));
  const m = await import("../src/packb20.js");
  assert.equal((await m.txbatch({ hashes: "0x12" })).status, 400);
  assert.equal((await m.balancediff({})).status, 400);
  assert.equal((await m.eip712domain({ token: "zz" })).status, 400);
  assert.equal((await m.basefeenext({ chains: "nope" })).status, 400);
});

test("packb21 paid + validation", async () => {
  for (const p of ["/v1/authpayload", "/v1/multicall", "/v1/erc1155bal", "/v1/eventtopic"]) assert.ok(PAID_PATHS.has(p));
  const m = await import("../src/packb21.js");
  assert.equal((await m.authpayload({})).status, 400);
  assert.equal((await m.multicall({ calls: "x" })).status, 400);
  assert.equal((await m.erc1155bal({})).status, 400);
  const r = await m.eventtopic({ signature: "Transfer(address,address,uint256)" });
  assert.equal(r.body.encoded[0].topic0, "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef");
});

test("packb22 paid + validation + EIP-155 vector", async () => {
  for (const p of ["/v1/authverify", "/v1/rawtx", "/v1/rolecheck", "/v1/ownership"]) assert.ok(PAID_PATHS.has(p));
  const m = await import("../src/packb22.js");
  assert.equal((await m.authverify({})).status, 400);
  assert.equal((await m.rolecheck({ contract: "0x1" })).status, 400);
  assert.equal((await m.ownership({})).status, 400);
  const r = await m.rawtx({ raw: "0xf86c098504a817c800825208943535353535353535353535353535353535353535880de0b6b3a76400008025a028ef61340bd939bc2195fe537567866003e1a15d3c71ff63e1590620aa636276a067cbe9d8997f761aecb703304b3800ccf555c9f3dc64214b297fb1966a3b6d83" });
  assert.equal(r.body.from, "0x9d8A62f656a8d1615C1294fd71e9CFb3E4855A4F");
});

test("packb23 wired + 400s", async () => {
  const { PAID_PATHS } = await import("../src/x402.js"); const m = await import("../src/packb23.js");
  for (const p of ["/v1/v3pool", "/v1/abiencode", "/v1/units", "/v1/msghash"]) assert.ok(PAID_PATHS.has(p), p);
  assert.equal((await m.abiencode({})).status, 400); assert.equal((await m.units({})).status, 400);
  assert.equal((await m.msghash({})).status, 400); assert.equal((await m.v3pool({ chain: "zz" })).status, 400);
  assert.equal((await m.msghash({ message: "hello" })).body.eip191_personal_sign_hash, "0x50b2c43fd39106bafbba0da34fc430e1f91e3c96ea2acee2bc34119f92b37750");
});

test("packb24 wired + 400s", async () => {
  const { PAID_PATHS } = await import("../src/x402.js"); const m = await import("../src/packb24.js");
  for (const p of ["/v1/txbuild", "/v1/safehash", "/v1/userophash", "/v1/revertdecode"]) assert.ok(PAID_PATHS.has(p), p);
  assert.equal((await m.txbuild({})).status, 400); assert.equal((await m.safehash({})).status, 400);
  assert.equal((await m.userophash({})).status, 400); assert.equal((await m.revertdecode({})).status, 400);
  assert.equal((await m.revertdecode({ data: "0x4e487b710000000000000000000000000000000000000000000000000000000000000011" })).body.code, "0x11");
});

test("packb25 wired + 400s", async () => {
  const { PAID_PATHS } = await import("../src/x402.js"); const m = await import("../src/packb25.js");
  for (const p of ["/v1/permitdata", "/v1/permit2data", "/v1/namehash", "/v1/x402req"]) assert.ok(PAID_PATHS.has(p), p);
  assert.equal((await m.permitdata({})).status, 400); assert.equal((await m.permit2data({})).status, 400);
  assert.equal((await m.namehash({})).status, 400); assert.equal((await m.x402req({})).status, 400);
  assert.equal((await m.namehash({ name: "vitalik.eth", resolve: "false" })).body.namehash, "0xee6c4522aab0003e8d14cd40a6af439055fd2577951148c14b6cea9a53475835");
});

test("packb26 wired + 400s", async () => {
  const { PAID_PATHS } = await import("../src/x402.js"); const m = await import("../src/packb26.js");
  for (const p of ["/v1/sigformat", "/v1/selectors", "/v1/codemeta", "/v1/aeropool"]) assert.ok(PAID_PATHS.has(p), p);
  assert.equal((await m.sigformat({})).status, 400); assert.equal((await m.selectors({})).status, 400);
  assert.equal((await m.codemeta({})).status, 400); assert.equal((await m.aeropool({ token_a: "ZZZ" })).status, 400);
  const hs = await m.sigformat({ signature: "0x" + "11".repeat(32) + "fffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364140" + "1b" });
  assert.equal(hs.body.high_s, true); assert.equal(hs.body.normalized_low_s.v, 28);
});

test("packb27 wired + 400s", async () => {
  const { PAID_PATHS } = await import("../src/x402.js"); const m = await import("../src/packb27.js");
  for (const p of ["/v1/createaddr", "/v1/revokebuild", "/v1/transferbuild", "/v1/cometpos"]) assert.ok(PAID_PATHS.has(p), p);
  assert.equal((await m.createaddr({})).status, 400); assert.equal((await m.revokebuild({})).status, 400);
  assert.equal((await m.transferbuild({})).status, 400); assert.equal((await m.cometpos({})).status, 400);
});

test("packb28 wired + 400s", async () => {
  const { PAID_PATHS } = await import("../src/x402.js"); const m = await import("../src/packb28.js");
  for (const p of ["/v1/wrapbuild", "/v1/multisend", "/v1/aavebuild", "/v1/rlpcodec"]) assert.ok(PAID_PATHS.has(p), p);
  assert.equal((await m.wrapbuild({})).status, 400); assert.equal((await m.multisend({})).status, 400);
  assert.equal((await m.aavebuild({})).status, 400); assert.equal((await m.rlpcodec({})).status, 400);
  assert.equal((await m.rlpcodec({ items: '["0xdead",[1,"0x"],1024]' })).body.encoded, "0xc982deadc20180820400");
});

test("packb29 wired + 400s", async () => {
  const { PAID_PATHS } = await import("../src/x402.js"); const m = await import("../src/packb29.js");
  for (const p of ["/v1/approvebuild", "/v1/nftsendbuild", "/v1/ethsendbuild", "/v1/cometbuild"]) assert.ok(PAID_PATHS.has(p), p);
  for (const f of ["approvebuild", "nftsendbuild", "ethsendbuild", "cometbuild"]) assert.equal((await m[f]({})).status, 400, f);
});

test("packb30 wired + 400s", async () => {
  const { PAID_PATHS } = await import("../src/x402.js"); const m = await import("../src/packb30.js");
  for (const p of ["/v1/swapbuild", "/v1/vaultbuild", "/v1/accesslist", "/v1/permit2build"]) assert.ok(PAID_PATHS.has(p), p);
  for (const f of ["swapbuild", "vaultbuild", "accesslist", "permit2build"]) assert.equal((await m[f]({})).status, 400, f);
});

test("packb31 wired + 400s", async () => {
  const { PAID_PATHS } = await import("../src/x402.js"); const m = await import("../src/packb31.js");
  for (const p of ["/v1/aeroswap", "/v1/cometrewards", "/v1/authhash", "/v1/canceltx"]) assert.ok(PAID_PATHS.has(p), p);
  for (const f of ["aeroswap", "cometrewards", "authhash", "canceltx"]) assert.equal((await m[f]({})).status, 400, f);
  assert.equal((await m.authhash({ address: "0x63c0c19a282a1B52b07dD5a65b58948A07DAE32B", chain_id: "8453", nonce: "0" })).body.preimage, "0x05d98221059463c0c19a282a1b52b07dd5a65b58948a07dae32b80");
});

test("packb32 paid + 400s", async () => {
  const { PAID_PATHS } = await import("../src/x402.js"); const m = await import("../src/packb32.js");
  for (const p of ["/v1/payoutbatch","/v1/safeexec","/v1/morphobuild","/v1/pullbuild"]) assert.ok(PAID_PATHS.has(p), p);
  for (const f of ["payoutbatch","safeexec","morphobuild","pullbuild"]) assert.equal((await m[f]({})).status, 400, f);
});

test("packb33 paid + 400s", async () => {
  const { PAID_PATHS } = await import("../src/x402.js"); const m = await import("../src/packb33.js");
  for (const p of ["/v1/nativesweep","/v1/tokensweep","/v1/delegatebuild","/v1/wstethbuild"]) assert.ok(PAID_PATHS.has(p), p);
  for (const f of ["nativesweep","tokensweep","delegatebuild","wstethbuild"]) assert.equal((await m[f]({})).status, 400, f);
});

test("packb34 paid + 400s", async () => {
  const { PAID_PATHS } = await import("../src/x402.js"); const m = await import("../src/packb34.js");
  for (const p of ["/v1/create2deploy","/v1/ethairdrop","/v1/lpcollect","/v1/permitsubmit"]) assert.ok(PAID_PATHS.has(p), p);
  for (const f of ["create2deploy","ethairdrop","lpcollect","permitsubmit"]) assert.equal((await m[f]({})).status, 400, f);
});

test("packb35 paid + 400s", async () => {
  const { PAID_PATHS } = await import("../src/x402.js"); const m = await import("../src/packb35.js");
  for (const p of ["/v1/tokenairdrop","/v1/safeownerbuild","/v1/nonceclear","/v1/cctpburn"]) assert.ok(PAID_PATHS.has(p), p);
  for (const f of ["tokenairdrop","safeownerbuild","nonceclear","cctpburn"]) assert.equal((await m[f]({})).status, 400, f);
});

test("packb36 paid + 400s", async () => {
  const { PAID_PATHS } = await import("../src/x402.js"); const m = await import("../src/packb36.js");
  for (const p of ["/v1/l2deposit","/v1/l2withdraw","/v1/sendcalls","/v1/safecreate"]) assert.ok(PAID_PATHS.has(p), p);
  for (const f of ["l2deposit","l2withdraw","sendcalls","safecreate"]) assert.equal((await m[f]({})).status, 400, f);
});

test("packb37 paid + 400s", async () => {
  const { PAID_PATHS } = await import("../src/x402.js"); const m = await import("../src/packb37.js");
  for (const p of ["/v1/erc1155send","/v1/nftapprovalall","/v1/permit2lockdown","/v1/cancelauth"]) assert.ok(PAID_PATHS.has(p), p);
  for (const f of ["erc1155send","nftapprovalall","permit2lockdown","cancelauth"]) assert.equal((await m[f]({})).status, 400, f);
});

test("packb38 paid + 400s", async () => {
  const { PAID_PATHS } = await import("../src/x402.js"); const m = await import("../src/packb38.js");
  for (const p of ["/v1/acrossdeposit","/v1/lidowithdraw","/v1/lidoclaim","/v1/permit2nonce"]) assert.ok(PAID_PATHS.has(p), p);
  for (const f of ["acrossdeposit","lidowithdraw","lidoclaim","permit2nonce"]) assert.equal((await m[f]({})).status, 400, f);
});

test("packb39 paid + 400s", async () => {
  const { PAID_PATHS } = await import("../src/x402.js"); const m = await import("../src/packb39.js");
  for (const p of ["/v1/cowquote","/v1/cowstatus","/v1/cowcancel","/v1/cowpresign"]) assert.ok(PAID_PATHS.has(p), p);
  for (const f of ["cowquote","cowstatus","cowcancel","cowpresign"]) assert.equal((await m[f]({})).status, 400, f);
});

test("packb40 paid + 400s", async () => {
  const { PAID_PATHS } = await import("../src/x402.js"); const m = await import("../src/packb40.js");
  for (const p of ["/v1/kyberswap","/v1/veloraswap","/v1/lifiquote","/v1/swapbest"]) assert.ok(PAID_PATHS.has(p), p);
  for (const f of ["kyberswap","veloraswap","lifiquote","swapbest"]) assert.equal((await m[f]({})).status, 400, f);
});

test("packb41 paid + 400s", async () => {
  const { PAID_PATHS } = await import("../src/x402.js"); const m = await import("../src/packb41.js");
  for (const p of ["/v1/relayquote","/v1/relaystatus","/v1/dlnorder","/v1/dlnstatus"]) assert.ok(PAID_PATHS.has(p), p);
  for (const f of ["relayquote","relaystatus","dlnorder","dlnstatus"]) assert.equal((await m[f]({})).status, 400, f);
});

test("packb42 paid + 400s", async () => {
  const { PAID_PATHS } = await import("../src/x402.js"); const m = await import("../src/packb42.js");
  for (const p of ["/v1/acrossstatus","/v1/acrosslimits","/v1/cctpmint","/v1/cctpfee"]) assert.ok(PAID_PATHS.has(p), p);
  for (const f of ["acrossstatus","acrosslimits","cctpmint","cctpfee"]) assert.equal((await m[f]({})).status, 400, f);
});

test("packb43 paid + 400s", async () => {
  const { PAID_PATHS } = await import("../src/x402.js"); const m = await import("../src/packb43.js");
  for (const p of ["/v1/lifistatus","/v1/lifiroutes","/v1/lifirefuel","/v1/lzmessage"]) assert.ok(PAID_PATHS.has(p), p);
  for (const f of ["lifistatus","lifiroutes","lifirefuel","lzmessage"]) assert.equal((await m[f]({})).status, 400, f);
});

test("packb44 paid + 400s", async () => {
  const { PAID_PATHS } = await import("../src/x402.js"); const m = await import("../src/packb44.js");
  for (const p of ["/v1/whstatus","/v1/whvaa","/v1/axelarstatus","/v1/axelargas"]) assert.ok(PAID_PATHS.has(p), p);
  for (const f of ["whstatus","whvaa","axelarstatus","axelargas"]) assert.equal((await m[f]({})).status, 400, f);
});

test("packb45 paid + 400s", async () => {
  const { PAID_PATHS } = await import("../src/x402.js"); const m = await import("../src/packb45.js");
  for (const p of ["/v1/mayanquote","/v1/mayanstatus","/v1/symbiosisswap","/v1/symbiosisstatus"]) assert.ok(PAID_PATHS.has(p), p);
  for (const f of ["mayanquote","mayanstatus","symbiosisswap","symbiosisstatus"]) assert.equal((await m[f]({})).status, 400, f);
});

test("packb46 paid + 400s", async () => {
  const m = await import("../src/packb46.js");
  for (const f of ["pendlemarkets","pendleswap","pendlepositions","balancerquote"]) { assert.ok(PAID_PATHS.has("/v1/" + f), f); assert.equal((await m[f]({})).status, 400, f); }
});

test("packb47 paid + 400s", async () => {
  const m = await import("../src/packb47.js");
  for (const f of ["curvepools","curvelend","curveswap","crvusdmarkets"]) { assert.ok(PAID_PATHS.has("/v1/" + f), f); assert.equal((await m[f]({})).status, 400, f); }
});

test("packb48 paid + 400s", async () => {
  const m = await import("../src/packb48.js");
  for (const f of ["yearnvaults","yearnbuild","beefyvaults","beefybuild"]) { assert.ok(PAID_PATHS.has("/v1/" + f), f); assert.equal((await m[f]({})).status, 400, f); }
});

test("packb49 paid + 400s", async () => {
  const m = await import("../src/packb49.js");
  for (const f of ["savingsrates","savingsbuild","susdecooldown","usdsconvert"]) { assert.ok(PAID_PATHS.has("/v1/" + f), f); assert.equal((await m[f]({})).status, 400, f); }
});

test("packb50 paid + 400s", async () => {
  const m = await import("../src/packb50.js");
  for (const f of ["fluidlend","fluidbuild","fluidvaults","fluidpositions"]) { assert.ok(PAID_PATHS.has("/v1/" + f), f); assert.equal((await m[f]({})).status, 400, f); }
});

test("packb51 paid + 400s", async () => {
  const m = await import("../src/packb51.js");
  for (const f of ["merklrewards","merklclaim","merklopps","morphovaults"]) { assert.ok(PAID_PATHS.has("/v1/" + f), f); assert.equal((await m[f]({})).status, 400, f); }
});

test("packb52 paid + 400s", async () => {
  const m = await import("../src/packb52.js");
  for (const f of ["uniquote","uniswapbuild","unipools","uniposition"]) { assert.ok(PAID_PATHS.has("/v1/" + f), f); assert.equal((await m[f]({})).status, 400, f); }
});

test("packb53 paid + 400s", async () => {
  const m = await import("../src/packb53.js");
  for (const f of ["moonwellmarkets","moonwellposition","moonwellbuild","moonwellenter"]) { assert.ok(PAID_PATHS.has("/v1/" + f), f); assert.equal((await m[f]({})).status, 400, f); }
});

test("packb54 paid + 400s", async () => {
  const m = await import("../src/packb54.js");
  for (const f of ["aavemarkets","sparkmarkets","sparkposition","sparkbuild"]) { assert.ok(PAID_PATHS.has("/v1/" + f), f); assert.equal((await m[f]({})).status, 400, f); }
});

test("packb55 paid + 400s", async () => {
  const m = await import("../src/packb55.js");
  for (const f of ["eulervaults","eulervault","eulerposition","eulerbuild"]) { assert.ok(PAID_PATHS.has("/v1/" + f), f); assert.equal((await m[f]({})).status, 400, f); }
});

test("packb56 paid + 400s", async () => {
  const m = await import("../src/packb56.js");
  for (const f of ["rethstats","rethbuild","weethstats","weethbuild"]) { assert.ok(PAID_PATHS.has("/v1/" + f), f); assert.equal((await m[f]({})).status, 400, f); }
});

test("packb57 paid + 400s", async () => {
  const m = await import("../src/packb57.js");
  for (const f of ["v4pools","v4quote","v4swapbuild","v4position"]) { assert.ok(PAID_PATHS.has("/v1/" + f), f); assert.equal((await m[f]({})).status, 400, f); }
});

test("packb58 paid + 400s", async () => {
  const m = await import("../src/packb58.js");
  for (const f of ["skysavings","skysavingsbuild","savingsposition","susdestats"]) { assert.ok(PAID_PATHS.has("/v1/" + f), f); assert.equal((await m[f]({})).status, 400, f); }
});

test("packb59 paid + 400s", async () => {
  const m = await import("../src/packb59.js");
  for (const f of ["v2pair","v2quote","v2swapbuild","v2lp"]) { assert.ok(PAID_PATHS.has("/v1/" + f), f); assert.equal((await m[f]({})).status, 400, f); }
});

test("packb60 paid + 400s", async () => {
  const m = await import("../src/packb60.js");
  for (const f of ["morphoposition","morphomarket","morphovault","morphovaultpos"]) { assert.ok(PAID_PATHS.has("/v1/" + f), f); assert.equal((await m[f]({})).status, 400, f); }
});

test("packb61 paid + 400s", async () => {
  const m = await import("../src/packb61.js");
  for (const f of ["easattest","easschema","easattestbuild","easrevokebuild"]) { assert.ok(PAID_PATHS.has("/v1/" + f), f); assert.equal((await m[f]({})).status, 400, f); }
});

test("packb62 paid + 400s", async () => {
  const m = await import("../src/packb62.js");
  for (const f of ["balancerpools","balancerpool","balancerposition","balancerswapbuild"]) { assert.ok(PAID_PATHS.has("/v1/" + f), f); assert.equal((await m[f]({})).status, 400, f); }
});

test("packb63 paid + 400s", async () => {
  const m = await import("../src/packb63.js");
  for (const f of ["aerogauge","aerostake","aeroclaimbuild","aerolock"]) { assert.ok(PAID_PATHS.has("/v1/" + f), f); assert.equal((await m[f]({})).status, 400, f); }
});

test("packb64 paid + 400s", async () => {
  const m = await import("../src/packb64.js");
  for (const f of ["gmxmarkets","gmxprices","gmxglv","gmxlp"]) { assert.ok(PAID_PATHS.has("/v1/" + f), f); assert.equal((await m[f]({})).status, 400, f); }
});

test("packb65 paid + 400s", async () => {
  const m = await import("../src/packb65.js");
  for (const f of ["dydxmarkets","dydxbook","dydxfunding","dydxcandles"]) { assert.ok(PAID_PATHS.has("/v1/" + f), f); assert.equal((await m[f]({})).status, 400, f); }
});

test("packb66 paid + 400s", async () => {
  const m = await import("../src/packb66.js");
  for (const f of ["pmbook","pmhistory","pmholders","pmpositions"]) { assert.ok(PAID_PATHS.has("/v1/" + f), f); assert.equal((await m[f]({})).status, 400, f); }
});

test("packb67 paid + 400s", async () => {
  const m = await import("../src/packb67.js");
  for (const f of ["kalshimarket","kalshibook","kalshitrades","kalshicandles"]) { assert.ok(PAID_PATHS.has("/v1/" + f), f); assert.equal((await m[f]({})).status, 400, f); }
});

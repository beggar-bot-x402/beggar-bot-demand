// /v1/soltx: Solana transaction decoder, pure compute, zero outbound. Legacy + v0 (address lookup tables) wire format, base64 or base58.
// Decodes System, SPL Token / Token-2022, Associated Token, Compute Budget and Memo instructions; Ed25519 signature check via WebCrypto; fee estimate. No RPC.
const bad = (m) => ({ status: 400, body: { error: m } });
const ALPHA = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export function b58enc(u) { let n = 0n; for (const b of u) n = (n << 8n) | BigInt(b); let s = ""; while (n > 0n) { s = ALPHA[Number(n % 58n)] + s; n /= 58n; } for (const b of u) { if (b) break; s = "1" + s; } return s; }
export function b58dec(s) { let n = 0n; for (const c of s) { const i = ALPHA.indexOf(c); if (i < 0) throw new Error("invalid base58"); n = n * 58n + BigInt(i); } const out = []; while (n > 0n) { out.unshift(Number(n & 255n)); n >>= 8n; } for (const c of s) { if (c !== "1") break; out.unshift(0); } return Uint8Array.from(out); }
const hex = (u) => [...u].map((b) => b.toString(16).padStart(2, "0")).join("");
const SYS = "11111111111111111111111111111111", TOKEN = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", TOKEN22 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb", ATA = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
  CB = "ComputeBudget111111111111111111111111111111", MEMO = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr", MEMO1 = "Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo";
export const PROGRAMS = { [SYS]: "System Program", [TOKEN]: "SPL Token", [TOKEN22]: "SPL Token-2022", [ATA]: "Associated Token Account", [CB]: "Compute Budget", [MEMO]: "Memo v2", [MEMO1]: "Memo v1",
  "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5L3SvaB2r4": "Jupiter Aggregator v6", "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8": "Raydium AMM v4", "CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK": "Raydium CLMM", "CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C": "Raydium CPMM",
  "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc": "Orca Whirlpools", "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo": "Meteora DLMM", "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P": "Pump.fun", "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA": "PumpSwap AMM",
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s": "Metaplex Token Metadata", "Stake11111111111111111111111111111111111111": "Stake Program", "Vote111111111111111111111111111111111111111p": "Vote Program",
  "AddressLookupTab1e1111111111111111111111111": "Address Lookup Table", "BPFLoaderUpgradeab1e11111111111111111111111": "BPF Upgradeable Loader", "L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95": "Lighthouse (guard)",
  "SMPLecH534NA9acpos4G6x7uf3LWbCAwZQE9e8ZekMu": "Squads v3", "SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf": "Squads v4" };
export const MINTS = { "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v": ["USDC", 6], "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB": ["USDT", 6], "So11111111111111111111111111111111111111112": ["wSOL", 9],
  "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU": ["USDC (devnet)", 6], "2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo": ["PYUSD", 6] };
class R { constructor(b) { this.b = b; this.o = 0; } need(n) { if (this.o + n > this.b.length) throw new Error("truncated at byte " + this.o); }
  u8() { this.need(1); return this.b[this.o++]; } bytes(n) { this.need(n); const s = this.b.subarray(this.o, this.o + n); this.o += n; return s; }
  sv() { let v = 0, s = 0; for (let i = 0; i < 3; i++) { const x = this.u8(); v |= (x & 0x7f) << s; if (!(x & 0x80)) return v; s += 7; } throw new Error("bad shortvec"); } }
const u32 = (d, o) => { if (d.length < o + 4) throw new Error("ix data short"); return d[o] | (d[o + 1] << 8) | (d[o + 2] << 16) | (d[o + 3] << 24) >>> 0; };
const u64 = (d, o) => { if (d.length < o + 8) throw new Error("ix data short"); let v = 0n; for (let i = 7; i >= 0; i--) v = (v << 8n) | BigInt(d[o + i]); return v; };
const units = (v, d) => { const D = 10n ** BigInt(d), fr = (v % D).toString().padStart(d, "0").replace(/0+$/, ""); return (v / D).toString() + (fr ? "." + fr : ""); };
const sol = (v) => units(v, 9) + " SOL";
const SYS_NAMES = ["CreateAccount", "Assign", "Transfer", "CreateAccountWithSeed", "AdvanceNonceAccount", "WithdrawNonceAccount", "InitializeNonceAccount", "AuthorizeNonceAccount", "Allocate", "AllocateWithSeed", "AssignWithSeed", "TransferWithSeed", "UpgradeNonceAccount"];
const TOK_NAMES = ["InitializeMint", "InitializeAccount", "InitializeMultisig", "Transfer", "Approve", "Revoke", "SetAuthority", "MintTo", "Burn", "CloseAccount", "FreezeAccount", "ThawAccount", "TransferChecked", "ApproveChecked", "MintToChecked", "BurnChecked", "InitializeAccount2", "SyncNative", "InitializeAccount3", "InitializeMultisig2", "InitializeMint2", "GetAccountDataSize", "InitializeImmutableOwner", "AmountToUiAmount", "UiAmountToAmount", "InitializeMintCloseAuthority", "TransferFeeExtension", "ConfidentialTransferExtension", "DefaultAccountStateExtension", "Reallocate", "MemoTransferExtension", "CreateNativeMint"];
function decodeIx(pid, d, acc) {
  const A = (i) => acc[i]?.address ?? null;
  if (pid === SYS) { if (d.length < 4) return { error: "short" }; const t = u32(d, 0), name = SYS_NAMES[t] || "Unknown(" + t + ")", o = { type: name };
    if (t === 2) Object.assign(o, { from: A(0), to: A(1), lamports: u64(d, 4).toString(), amount: sol(u64(d, 4)) });
    else if (t === 0) Object.assign(o, { from: A(0), new_account: A(1), lamports: u64(d, 4).toString(), space: u64(d, 12).toString(), owner: b58enc(d.subarray(20, 52)) });
    else if (t === 1) o.owner = b58enc(d.subarray(4, 36)); else if (t === 8) o.space = u64(d, 4).toString(); else if (t === 4) Object.assign(o, { nonce_account: A(0), nonce_authority: A(2), durable_nonce: true });
    else if (t === 11) Object.assign(o, { from: A(0), to: A(2), lamports: u64(d, 4).toString(), amount: sol(u64(d, 4)) });
    return o; }
  if (pid === CB) { const t = d[0]; if (t === 2) return { type: "SetComputeUnitLimit", units: u32(d, 1) }; if (t === 3) return { type: "SetComputeUnitPrice", micro_lamports: u64(d, 1).toString() }; if (t === 1) return { type: "RequestHeapFrame", bytes: u32(d, 1) }; if (t === 4) return { type: "SetLoadedAccountsDataSizeLimit", bytes: u32(d, 1) }; return { type: "Unknown(" + t + ")" }; }
  if (pid === MEMO || pid === MEMO1) { let s; try { s = new TextDecoder("utf-8", { fatal: true }).decode(d); } catch { s = null; } return { type: "Memo", memo: s, memo_hex: s === null ? hex(d) : undefined }; }
  if (pid === ATA) { const t = d.length ? d[0] : 0; return { type: ["Create", "CreateIdempotent", "RecoverNested"][t] || "Unknown(" + t + ")", payer: A(0), associated_account: A(1), wallet: A(2), mint: A(3) }; }
  if (pid === TOKEN || pid === TOKEN22) { if (!d.length) return { error: "empty" }; const t = d[0], o = { type: TOK_NAMES[t] || "Unknown(" + t + ")" };
    const amt = (mint, raw, dec) => { const m = MINTS[mint]; const de = dec ?? m?.[1]; if (de !== undefined) o.ui_amount = units(raw, de) + (m ? " " + m[0] : ""); if (m) o.token = m[0]; };
    if (t === 3) { Object.assign(o, { source: A(0), destination: A(1), authority: A(2), amount: u64(d, 1).toString() }); }
    else if (t === 12) { Object.assign(o, { source: A(0), mint: A(1), destination: A(2), authority: A(3), amount: u64(d, 1).toString(), decimals: d[9] }); amt(o.mint, u64(d, 1), d[9]); }
    else if (t === 4) { Object.assign(o, { source: A(0), delegate: A(1), owner: A(2), amount: u64(d, 1).toString() }); if (u64(d, 1) === 0xffffffffffffffffn) o.warning = "UNLIMITED delegate approval"; }
    else if (t === 13) { Object.assign(o, { source: A(0), mint: A(1), delegate: A(2), owner: A(3), amount: u64(d, 1).toString(), decimals: d[9] }); amt(o.mint, u64(d, 1), d[9]); if (u64(d, 1) === 0xffffffffffffffffn) o.warning = "UNLIMITED delegate approval"; }
    else if (t === 7 || t === 14) { Object.assign(o, { mint: A(0), destination: A(1), authority: A(2), amount: u64(d, 1).toString() }); if (t === 14) { o.decimals = d[9]; amt(o.mint, u64(d, 1), d[9]); } }
    else if (t === 8 || t === 15) { Object.assign(o, { account: A(0), mint: A(1), authority: A(2), amount: u64(d, 1).toString() }); if (t === 15) { o.decimals = d[9]; amt(o.mint, u64(d, 1), d[9]); } }
    else if (t === 9) Object.assign(o, { account: A(0), destination: A(1), owner: A(2) }); else if (t === 5) Object.assign(o, { source: A(0), owner: A(1) });
    else if (t === 6) { Object.assign(o, { account: A(0), authority_type: ["MintTokens", "FreezeAccount", "AccountOwner", "CloseAccount"][d[1]] ?? d[1], new_authority: d[2] ? b58enc(d.subarray(3, 35)) : null }); if (d[1] === 2) o.warning = "token account OWNER change"; }
    else if (t === 1 || t === 16 || t === 18) Object.assign(o, { account: A(0), mint: A(1) }); else if (t === 17) o.account = A(0);
    return o; }
  return null;
}
export async function verifySigs(sigs, keys, msg) {
  const out = []; for (let i = 0; i < sigs.length; i++) { const s = sigs[i]; if (s.every((x) => x === 0)) { out.push({ signer: keys[i], status: "missing (all-zero placeholder)" }); continue; }
    try { const k = await crypto.subtle.importKey("raw", b58dec(keys[i]), { name: "Ed25519" }, false, ["verify"]); out.push({ signer: keys[i], status: (await crypto.subtle.verify({ name: "Ed25519" }, k, s, msg)) ? "valid" : "INVALID" }); }
    catch (e) { out.push({ signer: keys[i], status: "unverifiable: " + e.message }); } }
  return out;
}
export async function soltx(a) {
  let raw = a.tx ?? a.transaction ?? a.data; if (Array.isArray(raw)) raw = raw[0]; if (!raw || typeof raw !== "string") return bad("tx required: serialized Solana transaction (base64 default, or base58 with encoding=base58)");
  raw = raw.trim(); if (raw.length > 20000) return bad("tx too long (Solana packets are ≤1232 bytes)");
  const messageOnly = String(a.message_only) === "true";
  const encs = a.encoding ? [String(a.encoding)] : (/^[A-Za-z0-9+/]+=*$/.test(raw) && raw.length % 4 === 0 ? ["base64", "base58"] : ["base58", "base64"]);
  if (encs.some((e) => e !== "base64" && e !== "base58")) return bad("encoding must be base64 or base58");
  let err = "";
  for (const enc of encs) { let b; try { b = enc === "base58" ? b58dec(raw) : Uint8Array.from(atob(raw), (c) => c.charCodeAt(0)); } catch { err ||= "could not decode tx as " + enc; continue; }
    try { return { status: 200, body: await parseTx(b, enc, messageOnly) }; } catch (e) { err = "malformed transaction: " + e.message; } }
  return bad(err);
}
async function parseTx(b, enc, messageOnly) {
  {
    const r = new R(b); const sigs = []; if (!messageOnly) { const n = r.sv(); if (n > 127) throw new Error("too many signatures"); for (let i = 0; i < n; i++) sigs.push(r.bytes(64)); }
    const msgStart = r.o; let version = "legacy"; if (r.b[r.o] & 0x80) { const v = r.u8() & 0x7f; if (v !== 0) throw new Error("unsupported message version " + v); version = 0; }
    const hdr = { num_required_signatures: r.u8(), num_readonly_signed: r.u8(), num_readonly_unsigned: r.u8() };
    const nk = r.sv(); if (nk > 256) throw new Error("too many account keys"); const keys = []; for (let i = 0; i < nk; i++) keys.push(b58enc(r.bytes(32)));
    const blockhash = b58enc(r.bytes(32)); const ixRaw = []; const ni = r.sv(); if (ni > 256) throw new Error("too many instructions");
    for (let i = 0; i < ni; i++) { const p = r.u8(); const na = r.sv(); const ai = [...r.bytes(na)]; const dl = r.sv(); ixRaw.push({ p, ai, data: r.bytes(dl) }); }
    const lookups = []; if (version === 0) { const nl = r.sv(); for (let i = 0; i < nl; i++) { const t = b58enc(r.bytes(32)); const w = [...r.bytes(r.sv())]; const ro = [...r.bytes(r.sv())]; lookups.push({ table: t, writable_indexes: w, readonly_indexes: ro }); } }
    const msg = b.subarray(msgStart, r.o); const trailing = b.length - r.o;
    if (!messageOnly && sigs.length !== hdr.num_required_signatures) throw new Error(`signature count ${sigs.length} != header num_required_signatures ${hdr.num_required_signatures}`);
    const { num_required_signatures: ns, num_readonly_signed: nrs, num_readonly_unsigned: nru } = hdr;
    const accounts = keys.map((k, i) => ({ address: k, signer: i < ns, writable: i < ns ? i < ns - nrs : i < nk - nru, source: "static", ...(PROGRAMS[k] ? { label: PROGRAMS[k] } : {}), ...(MINTS[k] ? { label: "mint " + MINTS[k][0] } : {}) }));
    for (const l of lookups) for (const ix of l.writable_indexes) accounts.push({ address: `lookup:${l.table}[${ix}]`, signer: false, writable: true, source: "address_lookup_table" });
    for (const l of lookups) for (const ix of l.readonly_indexes) accounts.push({ address: `lookup:${l.table}[${ix}]`, signer: false, writable: false, source: "address_lookup_table" });
    let cuLimit = null, cuPrice = 0n; const warnings = []; const programs = new Set();
    const instructions = ixRaw.map((ix, n) => { const pid = accounts[ix.p]?.address ?? `#${ix.p}`; programs.add(pid); const acc = ix.ai.map((i) => accounts[i] ? { address: accounts[i].address, signer: accounts[i].signer, writable: accounts[i].writable } : { address: `#${i} (out of range)` });
      const o = { index: n, program_id: pid, program: PROGRAMS[pid] || null, accounts: acc.map((x) => x.address), data_hex: hex(ix.data), data_bytes: ix.data.length };
      try { const d = decodeIx(pid, ix.data, acc); if (d) { o.parsed = d; if (d.type === "SetComputeUnitLimit") cuLimit = d.units; if (d.type === "SetComputeUnitPrice") cuPrice = BigInt(d.micro_lamports); if (d.warning) warnings.push(`ix ${n}: ${d.warning}`); }
        else if (ix.data.length >= 8) o.anchor_discriminator = hex(ix.data.subarray(0, 8)); } catch (e) { o.parse_error = e.message; }
      return o; });
    const nonCb = instructions.filter((x) => x.program_id !== CB).length; const effLimit = cuLimit ?? Math.min(1400000, 200000 * nonCb);
    const prio = (cuPrice * BigInt(effLimit) + 999999n) / 1000000n; const base = 5000n * BigInt(ns);
    const out = { version, encoding: enc, size_bytes: b.length, packet_limit_ok: b.length <= 1232, header: hdr, fee_payer: keys[0] || null, recent_blockhash_or_nonce: blockhash, signatures: sigs.map((s) => b58enc(s)), tx_id: sigs[0] && !sigs[0].every((x) => x === 0) ? b58enc(sigs[0]) : null,
      accounts, address_lookup_tables: lookups, instructions, programs: [...programs].map((p) => ({ id: p, name: PROGRAMS[p] || null })),
      fee_estimate: { base_fee_lamports: base.toString(), compute_unit_limit: effLimit, compute_unit_limit_source: cuLimit === null ? "default 200k per non-ComputeBudget ix" : "SetComputeUnitLimit", compute_unit_price_micro_lamports: cuPrice.toString(), priority_fee_lamports: prio.toString(), total_lamports: (base + prio).toString(), total: sol(base + prio) } };
    if (trailing) warnings.push(`${trailing} trailing bytes after message`);
    if (instructions.some((x) => x.parsed?.durable_nonce)) warnings.push("durable nonce transaction: does not expire with the blockhash");
    const transfers = instructions.filter((x) => x.parsed && /^(Transfer|TransferChecked|TransferWithSeed)$/.test(x.parsed.type)).map((x) => x.parsed.ui_amount ? `${x.parsed.ui_amount} → ${x.parsed.destination}` : x.parsed.amount && x.program_id === SYS ? `${x.parsed.amount} → ${x.parsed.to}` : `${x.parsed.amount} base units → ${x.parsed.destination}`);
    out.summary = transfers; if (instructions.some((x) => !x.parsed && x.program_id !== CB)) out.unparsed_programs = [...new Set(instructions.filter((x) => !x.parsed).map((x) => PROGRAMS[x.program_id] || x.program_id))];
    if (!messageOnly) { out.signature_check = await verifySigs(sigs, keys, msg); if (out.signature_check.some((x) => x.status.startsWith("missing"))) out.partially_signed = true; if (out.signature_check.some((x) => x.status === "INVALID")) warnings.push("one or more signatures INVALID for this message"); }
    out.warnings = warnings; out.note = "offline decode: no RPC; lookup-table addresses unresolved (shown as lookup:table[index]); blockhash freshness and balances not checked";
    return out;
  }
}

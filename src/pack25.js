// pack25: hlspotbal, hlfees, hlidentity, hlvaultpos (Hyperliquid address enrichment)
const R = (status, body) => ({ status, body });
const err = (e) => /hyperliquid (422|500)/.test(String(e.message)) ? R(404, { error: "unknown address on hyperliquid" }) : R(502, { error: String(e.message || e).slice(0, 200) });
const n = (v, d, lo, hi) => Math.max(lo, Math.min(hi, parseFloat(v || d) || d));
const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(a || "");
async function hl(body) { const r = await fetch("https://api.hyperliquid.xyz/info", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(12000) }); if (!r.ok) throw new Error("hyperliquid " + r.status); return r.json(); }
const need = (a) => (isAddr(a.address) ? null : R(400, { error: "address required (0x…40 hex)" }));

export async function hlspotbal(a) {
  const bad = need(a); if (bad) return bad;
  try {
    const user = a.address.toLowerCase(); const [st, [meta, ctx]] = await Promise.all([hl({ type: "spotClearinghouseState", user }), hl({ type: "spotMetaAndAssetCtxs" })]);
    const px = { USDC: 1 }; meta.universe.forEach((u, i) => { const [b, q] = u.tokens; if (q === 0 && ctx[i]) { const t = meta.tokens.find((t) => t.index === b); if (t && px[t.name] == null) px[t.name] = +ctx[i].markPx || +ctx[i].midPx || null; } });
    const rows = (st.balances || []).map((b) => { const p = px[b.coin] ?? null, tot = +b.total, v = p != null ? tot * p : null, entry = +b.entryNtl; return { coin: b.coin, total: tot, on_hold: +b.hold, price_usd: p, value_usd: v != null ? Math.round(v) : null, cost_basis_usd: entry ? Math.round(entry) : null, upnl_usd: entry && v != null ? Math.round(v - entry) : null }; }).filter((r) => r.total > 0).sort((p, q) => (q.value_usd || 0) - (p.value_usd || 0));
    const tot = rows.reduce((s, r) => s + (r.value_usd || 0), 0);
    return R(200, { venue: "hyperliquid", address: user, tokens: rows.length, total_value_usd: tot, stablecoin_share_pct: tot ? +((100 * rows.filter((r) => /^(USDC|USDT0|USDH|USDE)$/i.test(r.coin)).reduce((s, r) => s + (r.value_usd || 0), 0)) / tot).toFixed(1) : null, balances: rows.slice(0, n(a.limit, 50, 1, 300)).map((r) => ({ ...r, share_pct: tot && r.value_usd ? +((100 * r.value_usd) / tot).toFixed(2) : null })) });
  } catch (e) { return err(e); }
}

export async function hlfees(a) {
  const bad = need(a); if (bad) return bad;
  try {
    const user = a.address.toLowerCase(); const f = await hl({ type: "userFees", user }); const d = f.dailyUserVlm || [];
    const taker = d.reduce((s, x) => s + +x.userCross, 0), maker = d.reduce((s, x) => s + +x.userAdd, 0), ex = d.reduce((s, x) => s + +x.exchange, 0);
    return R(200, { venue: "hyperliquid", address: user, taker_rate_bps: +(+f.userCrossRate * 1e4).toFixed(3), maker_rate_bps: +(+f.userAddRate * 1e4).toFixed(3), spot_taker_rate_bps: f.userSpotCrossRate != null ? +(+f.userSpotCrossRate * 1e4).toFixed(3) : null, spot_maker_rate_bps: f.userSpotAddRate != null ? +(+f.userSpotAddRate * 1e4).toFixed(3) : null,
      referral_discount_pct: +(+f.activeReferralDiscount * 100).toFixed(2), staking_discount_pct: f.activeStakingDiscount ? +(+f.activeStakingDiscount.discount * 100).toFixed(2) : 0, window_days: d.length, volume_usd: Math.round(taker + maker), taker_volume_usd: Math.round(taker), maker_volume_usd: Math.round(maker), maker_share_pct: taker + maker ? +((100 * maker) / (taker + maker)).toFixed(1) : null, share_of_exchange_volume_pct: ex ? +((100 * (taker + maker)) / ex).toFixed(4) : null,
      est_fees_paid_usd: Math.round(taker * +f.userCrossRate + maker * +f.userAddRate), maker_rebate: +f.userAddRate < 0, daily: d.map((x) => ({ date: x.date, taker_usd: Math.round(+x.userCross), maker_usd: Math.round(+x.userAdd) })) });
  } catch (e) { return err(e); }
}

export async function hlidentity(a) {
  const bad = need(a); if (bad) return bad;
  try {
    const user = a.address.toLowerCase(); const [role, subs, ref] = await Promise.all([hl({ type: "userRole", user }), hl({ type: "subAccounts", user }).catch(() => null), hl({ type: "referral", user }).catch(() => null)]);
    const sa = (subs || []).map((s) => ({ name: s.name, address: s.subAccountUser, account_value_usd: Math.round(+(s.clearinghouseState?.marginSummary?.accountValue || 0)), positions: (s.clearinghouseState?.assetPositions || []).length }));
    return R(200, { venue: "hyperliquid", address: user, role: role?.role || "unknown", master: role?.data?.master || role?.data?.user || null, is_vault: role?.role === "vault", is_agent_wallet: role?.role === "agent", is_subaccount: role?.role === "subAccount",
      subaccounts: sa, subaccount_value_usd: sa.reduce((s, x) => s + x.account_value_usd, 0), referred_by: ref?.referredBy || null, lifetime_volume_usd: ref?.cumVlm ? Math.round(+ref.cumVlm) : null, referral_rewards: ref ? { unclaimed: +ref.unclaimedRewards, claimed: +ref.claimedRewards, builder: +(ref.builderRewards || 0) } : null, referrer_code: ref?.referrerState?.data?.code || null, referrer_stage: ref?.referrerState?.stage || null, referred_users: ref?.referrerState?.data?.referralStates?.length ?? null });
  } catch (e) { return err(e); }
}

export async function hlvaultpos(a) {
  const bad = need(a); if (bad) return bad;
  try {
    const user = a.address.toLowerCase(); const eq = await hl({ type: "userVaultEquities", user });
    const rows = await Promise.all((eq || []).slice(0, 20).map(async (v) => { let d = null; try { d = await hl({ type: "vaultDetails", vaultAddress: v.vaultAddress, user }); } catch {} const me = d?.followerState || null;
      return { vault: v.vaultAddress, name: d?.name || null, equity_usd: +(+v.equity).toFixed(2), pnl_usd: me ? +(+me.pnl).toFixed(2) : null, all_time_pnl_usd: me ? +(+me.allTimePnl).toFixed(2) : null, days_following: me?.daysFollowing ?? null, entered: me?.vaultEntryTime ? new Date(me.vaultEntryTime).toISOString() : null, locked_until: v.lockedUntilTimestamp ? new Date(v.lockedUntilTimestamp).toISOString() : null, vault_apr_pct: d?.apr != null ? +(d.apr * 100).toFixed(2) : null, leader: d?.leader || null }; }));
    rows.sort((p, q) => q.equity_usd - p.equity_usd);
    return R(200, { venue: "hyperliquid", address: user, vaults: rows.length, total_vault_equity_usd: +rows.reduce((s, r) => s + r.equity_usd, 0).toFixed(2), total_pnl_usd: +rows.reduce((s, r) => s + (r.pnl_usd || 0), 0).toFixed(2), positions: rows });
  } catch (e) { return err(e); }
}

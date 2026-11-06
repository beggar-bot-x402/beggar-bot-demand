// Free A2A JSON-RPC 2.0 endpoint: answers catalog questions (which paid x402 route fits a job). No payment, no side effects.
import { catalogPaths } from "./manifests.js";
const J = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json", "access-control-allow-origin": "*" } });
const rid = () => crypto.randomUUID();
function answer(text, o) {
  const paths = catalogPaths(), words = String(text || "").toLowerCase().match(/[a-z0-9]{3,}/g) || [];
  const scored = Object.entries(paths).map(([p, d]) => { const h = (p + " " + d.description).toLowerCase(); return [p, d, words.reduce((n, w) => n + (h.includes(w) ? 1 : 0), 0)]; });
  const hits = scored.filter((x) => x[2] > 0).sort((a, b) => b[2] - a[2]).slice(0, 8);
  const list = (hits.length ? hits : scored.slice(0, 8)).map(([p, d]) => `- ${d.method} ${o}${p} — ${String(d.description).slice(0, 160)}`).join("\n");
  return `Beggar Bot: ${Object.keys(paths).length} pay-per-call x402 routes on Base USDC ($0.02 each, no API key). ${hits.length ? "Best matches" : "Popular routes"}:\n${list}\nFull catalog: ${o}/openapi.json · ${o}/.well-known/x402 · ${o}/llms.txt`;
}
export async function a2a(req, env, o) {
  if (req.method === "GET") return J({ ok: true, protocol: "A2A JSON-RPC 2.0", card: o + "/.well-known/agent-card.json", methods: ["message/send", "tasks/get"] });
  if (req.method !== "POST") return J({ error: "method not allowed" }, 405);
  let m; try { m = await req.json(); } catch { return J({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }); }
  const id = m?.id ?? null, method = m?.method;
  if (m?.jsonrpc !== "2.0" || typeof method !== "string") return J({ jsonrpc: "2.0", id, error: { code: -32600, message: "Invalid Request" } });
  if (method === "message/send" || method === "SendMessage") {
    const parts = m.params?.message?.parts || [], text = parts.map((x) => x?.text || "").join(" ").slice(0, 2000);
    return J({ jsonrpc: "2.0", id, result: { kind: "message", role: "agent", messageId: rid(), contextId: m.params?.message?.contextId || rid(), parts: [{ kind: "text", text: answer(text, o) }] } });
  }
  if (method === "tasks/get" || method === "GetTask" || method === "tasks/cancel" || method === "CancelTask") return J({ jsonrpc: "2.0", id, error: { code: -32001, message: "Task not found (this agent replies with messages, not tasks)" } });
  return J({ jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } });
}

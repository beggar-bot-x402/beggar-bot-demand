// Generates Ed25519 service key into .secrets/ (mode 600). Prints ONLY kid + public x, never d.
import { writeFileSync, mkdirSync, existsSync, chmodSync } from "node:fs";
const dir = new URL("../.secrets/", import.meta.url).pathname, f = dir + "receipt_signing_key.jwk";
if (existsSync(f)) { console.log("exists; not overwriting"); process.exit(0); }
mkdirSync(dir, { recursive: true, mode: 0o700 });
const kp = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
const jwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
jwk.kid = "bb-receipt-" + new Date().toISOString().slice(0, 10);
writeFileSync(f, JSON.stringify(jwk), { mode: 0o600 }); chmodSync(f, 0o600);
console.log(JSON.stringify({ kid: jwk.kid, x: jwk.x }));

// Pure-JS secp256k1 public-key recovery (ecrecover) for /v1/evmtx sender. Verify-only math on public data; no keys, no signing.
const P = 2n ** 256n - 2n ** 32n - 977n, N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const G = [0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n, 0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n];
const mod = (a, m = P) => { const r = a % m; return r < 0n ? r + m : r; };
function inv(a, m = P) { let [x, y, u, v] = [mod(a, m), m, 1n, 0n]; while (x) { const q = y / x; [x, y, u, v] = [y - q * x, x, v - q * u, u]; } if (y !== 1n) throw new Error("not invertible"); return mod(v, m); }
function powm(b, e, m = P) { let r = 1n; b = mod(b, m); while (e) { if (e & 1n) r = r * b % m; b = b * b % m; e >>= 1n; } return r; }
// Jacobian coordinates [X,Y,Z]; null = infinity
function dbl(p) { if (!p || p[1] === 0n) return null; const [X, Y, Z] = p, Y2 = Y * Y % P, S = 4n * X * Y2 % P, M = 3n * X * X % P, X3 = mod(M * M - 2n * S), Y3 = mod(M * (S - X3) - 8n * Y2 * Y2), Z3 = 2n * Y * Z % P; return [X3, Y3, Z3]; }
function add(p, q) { if (!p) return q; if (!q) return p; const [X1, Y1, Z1] = p, [X2, Y2, Z2] = q, Z1s = Z1 * Z1 % P, Z2s = Z2 * Z2 % P;
  const U1 = X1 * Z2s % P, U2 = X2 * Z1s % P, S1 = Y1 * Z2s % P * Z2 % P, S2 = Y2 * Z1s % P * Z1 % P;
  if (U1 === U2) return S1 === S2 ? dbl(p) : null; const H = mod(U2 - U1), R = mod(S2 - S1), H2 = H * H % P, H3 = H2 * H % P, V = U1 * H2 % P;
  const X3 = mod(R * R - H3 - 2n * V), Y3 = mod(R * (V - X3) - S1 * H3), Z3 = H * Z1 % P * Z2 % P; return [X3, Y3, Z3]; }
function mul(p, k) { let r = null, a = p; while (k) { if (k & 1n) r = add(r, a); a = dbl(a); k >>= 1n; } return r; }
const aff = (p) => { const zi = inv(p[2]), z2 = zi * zi % P; return [p[0] * z2 % P, p[1] * z2 % P * zi % P]; };
// returns uncompressed public key [x,y] as BigInts, or throws
export function recover(hash32, r, s, yParity) {
  if (r <= 0n || r >= N || s <= 0n || s >= N) throw new Error("r/s out of range");
  const x = r, y2 = mod(x ** 3n + 7n); let y = powm(y2, (P + 1n) / 4n); if (y * y % P !== y2) throw new Error("r is not on curve");
  if ((y & 1n) !== BigInt(yParity & 1)) y = P - y;
  const e = mod(BigInt("0x" + [...hash32].map((b) => b.toString(16).padStart(2, "0")).join("")), N), ri = inv(r, N);
  const Q = add(mul([G[0], G[1], 1n], mod(-e * ri, N)), mul([x, y, 1n], s * ri % N)); if (!Q) throw new Error("recovered point at infinity"); return aff(Q);
}
export const HALF_N = N / 2n;

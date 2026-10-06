// secp256k1 brute-force engine, compiled to WebAssembly with AssemblyScript.
// Build: npx asc assembly/engine.ts --outFile js/engine.wasm -O3 --noAssert --runtime stub
// The .wasm is a committed static asset; the worker falls back to the JS engine without it.
//
// Layout: up to MAX_LANES lane points in flat Uint32Arrays (8 little-endian limbs per
// coordinate). JS seeds lanes by writing affine coordinates straight into module memory,
// then drives scanAndStep(): check every lane's hash160 against the target words, and
// when nothing matches, advance every lane by +G with one batched inversion.

const MAX_LANES: i32 = 1024;
const XS = new Uint32Array(MAX_LANES * 8);
const YS = new Uint32Array(MAX_LANES * 8);
const BD = new Uint32Array(MAX_LANES * 8);  // per-lane batch denominators
const BPF = new Uint32Array(MAX_LANES * 8); // per-lane prefix products

/* ----- field mod P = 2^256 - 2^32 - 977, limbs fully reduced ----- */
const PL = new Uint32Array(8);
const GXL = new Uint32Array(8);
const GYL = new Uint32Array(8);
PL[0] = 0xFFFFFC2F; PL[1] = 0xFFFFFFFE;
for (let i = 2; i < 8; i++) PL[i] = 0xFFFFFFFF;
// GX = 79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798
GXL[0] = 0x16F81798; GXL[1] = 0x59F2815B; GXL[2] = 0x2DCE28D9; GXL[3] = 0x029BFCDB;
GXL[4] = 0xCE870B07; GXL[5] = 0x55A06295; GXL[6] = 0xF9DCBBAC; GXL[7] = 0x79BE667E;
// GY = 483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8
GYL[0] = 0xFB10D4B8; GYL[1] = 0x9C47D08F; GYL[2] = 0xA6855419; GYL[3] = 0xFD17B448;
GYL[4] = 0x0E1108A8; GYL[5] = 0x5DA4FBFC; GYL[6] = 0x26A3C465; GYL[7] = 0x483ADA77;

const FT = new Uint32Array(16);
const FU = new Uint32Array(10);

@inline function fgeq(a: Uint32Array, b: Uint32Array): bool {
  for (let i = 7; i >= 0; i--) {
    const ai = unchecked(a[i]), bi = unchecked(b[i]);
    if (ai != bi) return ai > bi;
  }
  return true;
}
@inline function fsubP(a: Uint32Array): void {
  let borrow: u64 = 0;
  for (let i = 0; i < 8; i++) {
    const ai: u64 = unchecked(a[i]);
    const bi: u64 = unchecked(PL[i]);
    unchecked(a[i] = u32(ai - bi - borrow));
    borrow = (ai < bi + borrow) ? 1 : 0;
  }
}

function fmul(r: Uint32Array, a: Uint32Array, b: Uint32Array): void {
  let carry: u64 = 0;
  for (let k = 0; k < 16; k++) {
    let lo: u64 = carry, hi: u64 = 0;
    const i0 = k > 7 ? k - 7 : 0, i1 = k < 7 ? k : 7;
    for (let i = i0; i <= i1; i++) {
      const p: u64 = u64(unchecked(a[i])) * u64(unchecked(b[k - i]));
      lo += p & 0xFFFFFFFF;
      hi += p >> 32;
    }
    unchecked(FT[k] = u32(lo));
    carry = (lo >> 32) + hi;
  }
  // First fold: U = T_lo + T_hi * (977 + 2^32)
  let c: u64 = 0;
  for (let i = 0; i < 8; i++) {
    const v: u64 = u64(unchecked(FT[i])) + u64(unchecked(FT[8 + i])) * 977 + c;
    unchecked(FU[i] = u32(v));
    c = v >> 32;
  }
  unchecked(FU[8] = u32(c));
  c = 0;
  for (let i = 0; i < 8; i++) {
    const v: u64 = u64(unchecked(FU[i + 1])) + u64(unchecked(FT[8 + i])) + c;
    unchecked(FU[i + 1] = u32(v));
    c = v >> 32;
  }
  unchecked(FU[9] = u32(c));
  // Second fold: r = U_lo + h * (977 + 2^32), h = FU[8] + FU[9]*2^32
  const h: u64 = u64(unchecked(FU[8])) + (u64(unchecked(FU[9])) << 32);
  const m: u64 = h * 977;
  let v: u64 = u64(unchecked(FU[0])) + (m & 0xFFFFFFFF);
  unchecked(r[0] = u32(v));
  v = u64(unchecked(FU[1])) + (m >> 32) + (h & 0xFFFFFFFF) + (v >> 32);
  unchecked(r[1] = u32(v));
  v = u64(unchecked(FU[2])) + (h >> 32) + (v >> 32);
  unchecked(r[2] = u32(v));
  c = v >> 32;
  for (let i = 3; i < 8; i++) {
    v = u64(unchecked(FU[i])) + c;
    unchecked(r[i] = u32(v));
    c = v >> 32;
  }
  let guard = 0;
  while (c != 0) { // fold an escaped carry: 2^256 == 977 + 2^32
    v = u64(unchecked(r[0])) + c * 977;
    unchecked(r[0] = u32(v));
    v = u64(unchecked(r[1])) + c + (v >> 32);
    unchecked(r[1] = u32(v));
    c = v >> 32;
    for (let i = 2; i < 8 && c != 0; i++) {
      v = u64(unchecked(r[i])) + c;
      unchecked(r[i] = u32(v));
      c = v >> 32;
    }
    if (++guard > 4) break; // unreachable in practice
  }
  while (fgeq(r, PL)) fsubP(r);
}

function fadd(r: Uint32Array, a: Uint32Array, b: Uint32Array): void {
  let c: u64 = 0;
  for (let i = 0; i < 8; i++) {
    const v: u64 = u64(unchecked(a[i])) + u64(unchecked(b[i])) + c;
    unchecked(r[i] = u32(v));
    c = v >> 32;
  }
  if (c != 0) { // overflowed 256 bits: add back 2^256 mod P = 977 + 2^32
    let v: u64 = u64(unchecked(r[0])) + 977;
    unchecked(r[0] = u32(v));
    v = u64(unchecked(r[1])) + 1 + (v >> 32);
    unchecked(r[1] = u32(v));
    c = v >> 32;
    for (let i = 2; i < 8 && c != 0; i++) {
      v = u64(unchecked(r[i])) + 1;
      unchecked(r[i] = u32(v));
      c = v >> 32;
    }
  }
  if (fgeq(r, PL)) fsubP(r);
}

function fsub(r: Uint32Array, a: Uint32Array, b: Uint32Array): void {
  let borrow: u64 = 0;
  for (let i = 0; i < 8; i++) {
    const ai: u64 = unchecked(a[i]), bi: u64 = unchecked(b[i]);
    unchecked(r[i] = u32(ai - bi - borrow));
    borrow = (ai < bi + borrow) ? 1 : 0;
  }
  if (borrow != 0) {
    let c: u64 = 0;
    for (let i = 0; i < 8; i++) {
      const v: u64 = u64(unchecked(r[i])) + u64(unchecked(PL[i])) + c;
      unchecked(r[i] = u32(v));
      c = v >> 32;
    }
  }
}

// Inversion via Fermat's little theorem: a^(P-2) mod P. Square-and-multiply over the
// fixed 256-bit exponent P-2 (u64 limbs, LE). ~500 fmuls, amortised over a whole batch.
const PM2: StaticArray<u64> = [0xFFFFFFFEFFFFFC2D, 0xFFFFFFFFFFFFFFFF, 0xFFFFFFFFFFFFFFFF, 0xFFFFFFFFFFFFFFFF];
const FINV_R = new Uint32Array(8);
const FINV_B = new Uint32Array(8);
function finv(r: Uint32Array, a: Uint32Array): void {
  FINV_R[0] = 1;
  for (let i = 1; i < 8; i++) unchecked(FINV_R[i] = 0);
  for (let i = 0; i < 8; i++) unchecked(FINV_B[i] = a[i]);
  for (let bit = 0; bit < 256; bit++) {
    if ((unchecked(PM2[bit >> 6]) >> (bit & 63)) & 1) fmul(FINV_R, FINV_R, FINV_B);
    fmul(FINV_B, FINV_B, FINV_B);
  }
  for (let i = 0; i < 8; i++) unchecked(r[i] = FINV_R[i]);
}

@inline function feq8(a: Uint32Array, b: Uint32Array): bool {
  for (let i = 0; i < 8; i++) if (unchecked(a[i]) != unchecked(b[i])) return false;
  return true;
}
@inline function fcopyFrom(r: Uint32Array, src: Uint32Array, off: i32): void {
  for (let i = 0; i < 8; i++) unchecked(r[i] = src[off + i]);
}
@inline function fcopyTo(dst: Uint32Array, off: i32, src: Uint32Array): void {
  for (let i = 0; i < 8; i++) unchecked(dst[off + i] = src[i]);
}

const TX = new Uint32Array(8), TY = new Uint32Array(8), TD = new Uint32Array(8),
  TDI = new Uint32Array(8), TAI = new Uint32Array(8), TL = new Uint32Array(8),
  TX3 = new Uint32Array(8), TY3 = new Uint32Array(8), TT = new Uint32Array(8),
  TACC = new Uint32Array(8);

// Affine +G on n lanes with one batched inversion (Montgomery trick).
export function batchStep(n: i32): void {
  TACC[0] = 1;
  for (let i = 1; i < 8; i++) unchecked(TACC[i] = 0);
  for (let i = 0; i < n; i++) {
    fcopyFrom(TX, XS, i * 8);
    if (feq8(TX, GXL)) { fcopyFrom(TY, YS, i * 8); fadd(TD, TY, TY); } // lane is G: doubling slope
    else fsub(TD, GXL, TX);
    fcopyTo(BD, i * 8, TD);
    fcopyTo(BPF, i * 8, TACC);
    fmul(TACC, TACC, TD);
  }
  finv(TAI, TACC);
  for (let i = n - 1; i >= 0; i--) {
    fcopyFrom(TT, BPF, i * 8); fmul(TDI, TAI, TT);
    fcopyFrom(TT, BD, i * 8); fmul(TAI, TAI, TT);
    fcopyFrom(TX, XS, i * 8); fcopyFrom(TY, YS, i * 8);
    if (feq8(TX, GXL)) { fmul(TL, TX, TX); fadd(TT, TL, TL); fadd(TL, TT, TL); fmul(TL, TL, TDI); }
    else { fsub(TL, GYL, TY); fmul(TL, TL, TDI); }
    fmul(TX3, TL, TL); fsub(TX3, TX3, TX); fsub(TX3, TX3, GXL);
    fsub(TT, TX, TX3); fmul(TT, TL, TT); fsub(TY3, TT, TY);
    fcopyTo(XS, i * 8, TX3); fcopyTo(YS, i * 8, TY3);
  }
}

/* ----- fused single-block SHA-256 + RIPEMD-160 over a lane's compressed pubkey ----- */
const K256: StaticArray<u32> = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
const RLP: StaticArray<u8> = [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,7,4,13,1,10,6,15,3,12,0,9,5,2,14,11,8,3,10,14,4,9,15,8,1,2,7,0,6,13,11,5,12,1,9,11,10,0,8,12,4,13,3,7,15,14,5,6,2,4,0,5,9,7,12,2,10,14,1,3,8,11,6,15,13];
const RRP: StaticArray<u8> = [5,14,7,0,9,2,11,4,13,6,15,8,1,10,3,12,6,11,3,7,0,13,5,10,14,15,8,12,4,9,1,2,15,5,1,3,7,14,6,9,11,8,12,2,10,0,4,13,8,6,4,1,3,11,15,0,5,12,2,13,9,7,10,14,12,15,10,4,1,5,8,7,6,2,13,14,0,3,9,11];
const SLP: StaticArray<u8> = [11,14,15,12,5,8,7,9,11,13,14,15,6,7,9,8,7,6,8,13,11,9,7,15,7,12,15,9,11,7,13,12,11,13,6,7,14,9,13,15,14,8,13,6,5,12,7,5,11,12,14,15,14,15,9,8,9,14,5,6,8,6,5,12,9,15,5,11,6,8,13,12,5,12,13,14,11,8,5,6];
const SRP: StaticArray<u8> = [8,9,9,11,13,15,15,5,7,7,8,11,14,14,12,6,9,13,15,7,12,8,9,11,7,7,12,7,6,15,13,11,9,7,15,11,8,6,6,14,12,13,5,14,13,13,7,5,15,5,8,11,14,14,6,14,6,9,12,9,12,5,15,8,8,5,12,9,12,5,14,6,8,13,6,5,15,13,11,11];
const KLP: StaticArray<u32> = [0x00000000,0x5A827999,0x6ED9EBA1,0x8F1BBCDC,0xA953FD4E];
const KRP: StaticArray<u32> = [0x50A28BE6,0x5C4DD124,0x6D703EF3,0x7A6D76E9,0x00000000];

const W = new Uint32Array(64);
const OUT5 = new Uint32Array(5); // hash160 result as five LE u32 words

@inline function rmd(j: u32, x: u32, y: u32, z: u32): u32 {
  if (j < 16) return x ^ y ^ z;
  if (j < 32) return (x & y) | (~x & z);
  if (j < 48) return (x | ~y) ^ z;
  if (j < 64) return (x & z) | (y & ~z);
  return x ^ (y | ~z);
}

function hash160lane(i: i32): void { // lane i -> OUT5
  const bo = i * 8;
  const x0 = unchecked(XS[bo]), x1 = unchecked(XS[bo+1]), x2 = unchecked(XS[bo+2]), x3 = unchecked(XS[bo+3]);
  const x4 = unchecked(XS[bo+4]), x5 = unchecked(XS[bo+5]), x6 = unchecked(XS[bo+6]), x7 = unchecked(XS[bo+7]);
  unchecked(W[0] = ((unchecked(YS[bo]) & 1) ? u32(0x03000000) : u32(0x02000000)) | (x7 >>> 8));
  unchecked(W[1] = (x7 << 24) | (x6 >>> 8)); unchecked(W[2] = (x6 << 24) | (x5 >>> 8));
  unchecked(W[3] = (x5 << 24) | (x4 >>> 8)); unchecked(W[4] = (x4 << 24) | (x3 >>> 8));
  unchecked(W[5] = (x3 << 24) | (x2 >>> 8)); unchecked(W[6] = (x2 << 24) | (x1 >>> 8));
  unchecked(W[7] = (x1 << 24) | (x0 >>> 8)); unchecked(W[8] = (x0 << 24) | 0x00800000);
  for (let j = 9; j < 15; j++) unchecked(W[j] = 0);
  unchecked(W[15] = 264);
  for (let j = 16; j < 64; j++) {
    const w15 = unchecked(W[j-15]), w2 = unchecked(W[j-2]);
    const s0 = rotl(w15, 25) ^ rotl(w15, 14) ^ (w15 >>> 3);
    const s1 = rotl(w2, 15) ^ rotl(w2, 13) ^ (w2 >>> 10);
    unchecked(W[j] = unchecked(W[j-16]) + s0 + unchecked(W[j-7]) + s1);
  }
  let a: u32 = 0x6a09e667, b: u32 = 0xbb67ae85, c: u32 = 0x3c6ef372, d: u32 = 0xa54ff53a;
  let e: u32 = 0x510e527f, f: u32 = 0x9b05688c, g: u32 = 0x1f83d9ab, h: u32 = 0x5be0cd19;
  for (let j = 0; j < 64; j++) {
    const S1 = rotl(e, 26) ^ rotl(e, 21) ^ rotl(e, 7);
    const ch = (e & f) ^ (~e & g);
    const t1 = h + S1 + ch + unchecked(K256[j]) + unchecked(W[j]);
    const S0 = rotl(a, 30) ^ rotl(a, 19) ^ rotl(a, 10);
    const maj = (a & b) ^ (a & c) ^ (b & c);
    const t2 = S0 + maj;
    h = g; g = f; f = e; e = d + t1; d = c; c = b; b = a; a = t1 + t2;
  }
  // RIPEMD-160 over the byte-swapped SHA-256 state, one block.
  unchecked(W[0] = bswap32(a + 0x6a09e667)); unchecked(W[1] = bswap32(b + 0xbb67ae85));
  unchecked(W[2] = bswap32(c + 0x3c6ef372)); unchecked(W[3] = bswap32(d + 0xa54ff53a));
  unchecked(W[4] = bswap32(e + 0x510e527f)); unchecked(W[5] = bswap32(f + 0x9b05688c));
  unchecked(W[6] = bswap32(g + 0x1f83d9ab)); unchecked(W[7] = bswap32(h + 0x5be0cd19));
  unchecked(W[8] = 0x80);
  for (let j = 9; j < 14; j++) unchecked(W[j] = 0);
  unchecked(W[14] = 256); unchecked(W[15] = 0);
  let al: u32 = 0x67452301, bl: u32 = 0xEFCDAB89, cl: u32 = 0x98BADCFE, dl: u32 = 0x10325476, el: u32 = 0xC3D2E1F0;
  let ar = al, br = bl, cr = cl, dr = dl, er = el;
  for (let j: u32 = 0; j < 80; j++) {
    const r = j >> 4;
    let t = rotl(al + rmd(j, bl, cl, dl) + unchecked(W[unchecked(RLP[j])]) + unchecked(KLP[r]), u32(unchecked(SLP[j]))) + el;
    al = el; el = dl; dl = rotl(cl, 10); cl = bl; bl = t;
    t = rotl(ar + rmd(79 - j, br, cr, dr) + unchecked(W[unchecked(RRP[j])]) + unchecked(KRP[r]), u32(unchecked(SRP[j]))) + er;
    ar = er; er = dr; dr = rotl(cr, 10); cr = br; br = t;
  }
  unchecked(OUT5[0] = 0xEFCDAB89 + cl + dr);
  unchecked(OUT5[1] = 0x98BADCFE + dl + er);
  unchecked(OUT5[2] = 0x10325476 + el + ar);
  unchecked(OUT5[3] = 0xC3D2E1F0 + al + br);
  unchecked(OUT5[4] = 0x67452301 + bl + cr);
}

/* ----- target + main entry ----- */
let TW0: u32 = 0, TW1: u32 = 0, TW2: u32 = 0, TW3: u32 = 0, TW4: u32 = 0;
export function setTarget(t0: u32, t1: u32, t2: u32, t3: u32, t4: u32): void {
  TW0 = t0; TW1 = t1; TW2 = t2; TW3 = t3; TW4 = t4;
}

// Check every lane's hash160 against the target; on match return the lane index with
// state untouched, otherwise advance all n lanes by +G and return -1.
export function scanAndStep(n: i32): i32 {
  for (let i = 0; i < n; i++) {
    hash160lane(i);
    if (unchecked(OUT5[0]) == TW0 && unchecked(OUT5[1]) == TW1 && unchecked(OUT5[2]) == TW2 &&
        unchecked(OUT5[3]) == TW3 && unchecked(OUT5[4]) == TW4) return i;
  }
  batchStep(n);
  return -1;
}

/* ----- JS glue ----- */
export function xsPtr(): usize { return XS.dataStart; }
export function ysPtr(): usize { return YS.dataStart; }
export function out5Ptr(): usize { return OUT5.dataStart; }
export function maxLanes(): i32 { return MAX_LANES; }
export function hashLaneForTest(i: i32): void { hash160lane(i); }

@inline function bswap32(x: u32): u32 {
  return (x >> 24) | ((x >> 8) & 0xFF00) | ((x << 8) & 0xFF0000) | (x << 24);
}

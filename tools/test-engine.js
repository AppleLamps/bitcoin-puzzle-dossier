// Correctness tests for the fast kernels in js/crypto.js, cross-checked against the
// reference BigInt implementations in the same file. Run: node tools/test-engine.js
'use strict';
const C = require('../js/crypto.js').PuzzleCrypto;
const F = C.FastField;
const nodeCrypto = require('crypto');

let failures = 0, checks = 0;
function ok(cond, label){
  checks++;
  if(!cond){ failures++; console.error('FAIL: ' + label); }
}
function hex(bytes){ return Buffer.from(bytes).toString('hex'); }
function randBytes(n){ const b = new Uint8Array(n); nodeCrypto.randomFillSync(b); return b; }
function randBelow(limit){
  const b = randBytes(32);
  let r = 0n; for(const x of b) r = (r << 8n) | BigInt(x);
  return r % limit;
}

// --- 1. specialized hashes match the generic ones ---
for(let i = 0; i < 2000; i++){
  const m33 = randBytes(33);
  ok(hex(C.sha256_33(m33)) === hex(C.sha256(m33)), 'sha256_33 vs sha256 #' + i);
  const m32 = randBytes(32);
  ok(hex(C.ripemd160_32(m32)) === hex(C.ripemd160(m32)), 'ripemd160_32 vs ripemd160 #' + i);
  ok(hex(C.hash160_33(m33)) === hex(C.hash160(m33)), 'hash160_33 vs hash160 #' + i);
}
console.log('hashes: specialized == generic (2000 random inputs each)');

// --- 2. cross-check against Node's OpenSSL where available ---
{
  const m = randBytes(33);
  const ref = nodeCrypto.createHash('sha256').update(m).digest('hex');
  ok(hex(C.sha256_33(m)) === ref, 'sha256_33 vs OpenSSL');
  try {
    const m2 = randBytes(32);
    const ref2 = nodeCrypto.createHash('ripemd160').update(m2).digest('hex');
    ok(hex(C.ripemd160_32(m2)) === ref2, 'ripemd160_32 vs OpenSSL');
    console.log('hashes: matched OpenSSL sha256 and ripemd160');
  } catch(e){ console.log('hashes: OpenSSL ripemd160 unavailable, skipped (sha256 matched)'); }
}

// --- 3. known vector: k=1 -> G -> hash160 / address ---
{
  const pt = C.mulG(1n);
  const h = C.hash160_33(C.compressed(pt));
  ok(hex(h) === '751e76e8199196d454941c45d1b3a323f1433bd6', 'hash160(G) known vector');
  ok(C.privToAddress(1n) === '1BgGZ9tcN4rm9KBzDn7KprQz87SZ26SAMH', 'address of k=1');
  ok(C.hash160ToAddress(h) === '1BgGZ9tcN4rm9KBzDn7KprQz87SZ26SAMH', 'address of hash160(G)');
  console.log('known vector: k=1 -> 1BgGZ9tcN4rm9KBzDn7KprQz87SZ26SAMH');
}

// --- 4. field arithmetic vs BigInt mod P ---
{
  const P = F.P, a8 = new Uint32Array(8), b8 = new Uint32Array(8), r8 = new Uint32Array(8);
  const edge = [0n, 1n, 2n, P - 1n, P - 2n, P >> 1n, C.GX, C.GY, 977n, (1n << 255n)];
  const cases = [];
  for(const x of edge) for(const y of edge) cases.push([x, y]);
  for(let i = 0; i < 3000; i++) cases.push([randBelow(P), randBelow(P)]);
  for(const [x, y] of cases){
    F.fFromBig(x, a8); F.fFromBig(y, b8);
    F.fmul(r8, a8, b8);
    ok(F.fToBig(r8) === (x * y) % P, 'fmul ' + x.toString(16).slice(0, 12) + ' * ' + y.toString(16).slice(0, 12));
    F.fadd(r8, a8, b8);
    ok(F.fToBig(r8) === (x + y) % P, 'fadd');
    F.fsub(r8, a8, b8);
    ok(F.fToBig(r8) === ((x - y) % P + P) % P, 'fsub');
    F.fmul(r8, r8, r8); // aliasing: squares the fsub result in place
    ok(F.fToBig(r8) === ((((x - y) % P + P) % P) ** 2n) % P, 'fmul aliased');
  }
  console.log('field: fmul/fadd/fsub match BigInt mod P on ' + cases.length + ' cases (incl. edges)');
}


// --- 5. batchAddGL matches batchAddG round for round ---
{
  const NLANES = 64, ROUNDS = 200;
  const xs = new Uint32Array(NLANES * 8), ys = new Uint32Array(NLANES * 8);
  const lanes = [];
  for(let i = 0; i < NLANES; i++){
    const k = randBelow(1n << 200n) + 1n;
    const pt = C.mulG(k);
    C.pointToLimbs(xs, ys, i, pt);
    lanes.push(pt);
  }
  let bad = 0;
  for(let round = 0; round < ROUNDS; round++){
    C.batchAddGL(xs, ys, NLANES);
    C.batchAddG(lanes);
    for(let i = 0; i < NLANES; i++){
      if(F.fToBig(xs.subarray(i * 8, i * 8 + 8)) !== lanes[i][0] ||
         F.fToBig(ys.subarray(i * 8, i * 8 + 8)) !== lanes[i][1]){
        bad++; if(bad < 3) console.error('FAIL: batchAddGL round ' + round + ' lane ' + i);
      }
    }
  }
  checks++; if(bad){ failures++; }
  console.log('batchAddGL: ' + ROUNDS + ' rounds x ' + NLANES + ' lanes match batchAddG' + (bad ? ' — ' + bad + ' MISMATCHES' : ''));
}

// --- 6. fastCompressed matches compressed ---
{
  const xs = new Uint32Array(8 * 16), ys = new Uint32Array(8 * 16);
  const out = new Uint8Array(33);
  for(let i = 0; i < 16; i++){
    const pt = C.mulG(randBelow(1n << 160n) + 1n);
    C.pointToLimbs(xs, ys, i, pt);
    C.fastCompressed(out, xs, ys, i);
    ok(hex(out) === hex(C.compressed(pt)), 'fastCompressed lane ' + i);
  }
  console.log('fastCompressed: matches compressed()');
}

// --- 7. end-to-end mini scan with the fast engine (with lane swap-removal) ---
{
  const start = randBelow(1n << 120n);
  const span = 5000;
  const secret = start + BigInt(2 + Math.floor(Math.random() * (span - 2)));
  const target = C.hash160(C.compressed(C.mulG(secret)));
  const xs = new Uint32Array(8 * 128), ys = new Uint32Array(8 * 128);
  const stride = Math.ceil(span / 128);
  const kb = [], ends = []; // kb[i]: key of lane i at step 0; ends[i]: last valid step offset
  let lanes = 0;
  for(let i = 0; i < 128; i++){
    const k0 = start + BigInt(i * stride);
    if(k0 > start + BigInt(span - 1)) break;
    C.pointToLimbs(xs, ys, lanes, C.mulG(k0));
    const le = start + BigInt(Math.min((i + 1) * stride, span) - 1);
    kb.push(k0); ends.push(Number(le - k0));
    lanes++;
  }
  const pub = new Uint8Array(33);
  let found = null, steps = 0;
  while(lanes > 0 && steps <= span){
    for(let i = 0; i < lanes; i++){
      C.fastCompressed(pub, xs, ys, i);
      const h = C.hash160_33(pub);
      let m = true;
      for(let j = 0; j < 20; j++) if(h[j] !== target[j]){ m = false; break; }
      if(m){ found = kb[i] + BigInt(steps); break; }
    }
    if(found !== null) break;
    C.batchAddGL(xs, ys, lanes);
    steps++;
    for(let i = lanes - 1; i >= 0; i--){
      if(steps > ends[i]){ // lane finished: swap-remove with last active lane
        const last = --lanes;
        if(i !== last){
          xs.set(xs.subarray(last * 8, last * 8 + 8), i * 8);
          ys.set(ys.subarray(last * 8, last * 8 + 8), i * 8);
          kb[i] = kb[last]; ends[i] = ends[last];
        }
      }
    }
  }
  ok(found !== null, 'scan found a key');
  if(found !== null){
    ok(hex(C.hash160(C.compressed(C.mulG(found)))) === hex(target), 'scan key verifies against target');
    ok(found === secret, 'scan found the exact planted key');
  }
  console.log('end-to-end: planted key recovered across lane exhaustion and swap-removal');
}

// --- 8. fused hash160x matches hash160(compressed()) ---
{
  const xs = new Uint32Array(8 * 32), ys = new Uint32Array(8 * 32);
  const DV = new DataView(new ArrayBuffer(20));
  for(let i = 0; i < 32; i++){
    const pt = C.mulG(randBelow(1n << 200n) + 1n);
    C.pointToLimbs(xs, ys, i, pt);
    const w = C.hash160x(xs, ys, i);
    const ref = C.hash160(C.compressed(pt));
    for(let j = 0; j < 20; j++) DV.setUint8(j, ref[j]);
    let same = true;
    for(let j = 0; j < 5; j++) if(DV.getInt32(j * 4, true) !== w[j]) same = false;
    ok(same, 'hash160x lane ' + i);
  }
  console.log('hash160x: fused pipeline matches reference hash160');
}

console.log(failures === 0 ? '\nALL ' + checks + ' CHECKS PASSED' : '\n' + failures + ' of ' + checks + ' CHECKS FAILED');
process.exit(failures === 0 ? 0 : 1);

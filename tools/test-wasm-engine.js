// Check the compiled engine against independent Node hashes and BigInt curve math.
// Run npm run build:wasm first, then node tools/test-wasm-engine.js.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const C = require('../js/crypto.js').PuzzleCrypto;

(async () => {
  const { instance } = await WebAssembly.instantiate(
    fs.readFileSync(path.join(__dirname, '../js/engine.wasm')),
    { env: { abort() { throw new Error('WASM engine aborted'); } } }
  );
  const E = instance.exports;
  assert.equal(E.maxLanes(), 1024);
  const xs = new Uint32Array(E.memory.buffer, E.xsPtr(), E.maxLanes() * 8);
  const ys = new Uint32Array(E.memory.buffer, E.ysPtr(), E.maxLanes() * 8);
  const hash = new Uint8Array(E.memory.buffer, E.out5Ptr(), 20);

  function hash160(point) {
    const sha = crypto.createHash('sha256').update(C.compressed(point)).digest();
    return crypto.createHash('ripemd160').update(sha).digest();
  }
  function setTarget(bytes) {
    const words = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    E.setTarget(...Array.from({ length: 5 }, (_, i) => words.getUint32(i * 4, true)));
  }
  function assertPoint(i, point) {
    assert.equal(C.FastField.fToBig(xs.subarray(i * 8, i * 8 + 8)), point[0], 'lane ' + i + ' x');
    assert.equal(C.FastField.fToBig(ys.subarray(i * 8, i * 8 + 8)), point[1], 'lane ' + i + ' y');
    E.hashLaneForTest(i);
    assert.equal(Buffer.from(hash).toString('hex'), hash160(point).toString('hex'), 'lane ' + i + ' hash160');
  }

  // Include G (the doubling path), high scalars, and random keys, then advance
  // full batches repeatedly to exercise inversion and in-place arithmetic.
  for (const n of [1, 64, E.maxLanes()]) {
    const points = [];
    for (let i = 0; i < n; i++) {
      const key = i === 0 ? 1n : i === 1 ? C.N - 1000n :
        BigInt('0x' + crypto.randomBytes(25).toString('hex')) + 1n;
      points.push(C.mulG(key));
      C.pointToLimbs(xs, ys, i, points[i]);
      assertPoint(i, points[i]);
    }
    for (let round = 0; round < 12; round++) {
      E.batchStep(n);
      C.batchAddG(points);
      for (let i = 0; i < n; i++) assertPoint(i, points[i]);
    }
    console.log('WASM: hash160 and 12 batch steps match references on ' + n + ' lanes');
  }

  // A miss must advance each lane once; a hit must leave every lane untouched.
  const keys = [1000n, 2000n, 3000n, 4000n];
  keys.forEach((key, i) => C.pointToLimbs(xs, ys, i, C.mulG(key)));
  setTarget(hash160(C.mulG(keys[3] + 15n)));
  for (let step = 0; step < 15; step++) {
    assert.equal(E.scanAndStep(keys.length), -1);
    keys.forEach((key, i) => assertPoint(i, C.mulG(key + BigInt(step + 1))));
  }
  const beforeX = xs.slice(), beforeY = ys.slice();
  assert.equal(E.scanAndStep(keys.length), 3);
  assert.deepEqual(xs, beforeX);
  assert.deepEqual(ys, beforeY);
  setTarget(hash160(C.mulG(keys[0] + 15n)));
  assert.equal(E.scanAndStep(keys.length), 0);
  assert.deepEqual(xs, beforeX);
  assert.deepEqual(ys, beforeY);
  console.log('WASM: planted key found; misses advance lanes and hits preserve state');
  console.log('WASM: ALL CHECKS PASSED');
})().catch(error => { console.error(error); process.exitCode = 1; });

'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const scope = { crypto:require('node:crypto').webcrypto, PuzzleCrypto:require('../js/crypto.js').PuzzleCrypto };
scope.self = scope;
vm.createContext(scope);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/random-blocks.js'), 'utf8'), scope);
const R = scope.PuzzleRandomBlocks;
const seed = '1a'.repeat(32), otherSeed = '7f'.repeat(32);
function blocks(start, end, options){
  const scheduler = R.create(start, end, options), result = [];
  for(let block; (block = scheduler.next());) result.push([block.lo, block.hi]);
  assert.equal(scheduler.next(), null);
  return result;
}
for(const length of [1,2,3,255,256,257,513,1009,1024,2051]){
  const order = blocks(123n, 122n + BigInt(length), { blockSize:3, seed });
  const visited = [];
  for(const [lo, hi] of order) for(let k=lo;k<=hi;k++) visited.push(k);
  assert.equal(visited.length, length);
  assert.equal(new Set(visited).size, length);
  assert.ok(visited.every(k => k >= 123n && k <= 122n + BigInt(length)));
  assert.deepEqual(order, blocks(123n, 122n + BigInt(length), { blockSize:3, seed }));
}
console.log('BLOCKS: deterministic complete permutations on tiny, power-of-two, and uneven intervals');

const first = blocks(1n, 4096n, { blockSize:1, seed });
assert.notDeepEqual(first, blocks(1n, 4096n, { blockSize:1, seed:otherSeed }));
assert.ok(first.some((block, i) => block[0] !== BigInt(i + 1)));
console.log('BLOCKS: different seeds produce different randomized orders');

const start = 1n << 70n, end = (1n << 71n) - 1n;
const uninterrupted = R.create(start, end, { seed });
assert.equal(uninterrupted.blockSize, R.DEFAULT_BLOCK_SIZE);
for(let i=0;i<256;i++) uninterrupted.next();
const resumed = R.create(start, end, { state:uninterrupted.snapshot() });
const seen = new Set();
for(let i=0;i<1000;i++){
  const a = uninterrupted.next(), b = resumed.next();
  assert.deepEqual(a, b);
  assert.ok(a.lo >= start && a.hi <= end);
  seen.add(String(a.lo));
}
assert.equal(seen.size, 1000);
assert.throws(() => R.create(start, end, { seed:'invalid' }));
assert.throws(() => R.create(start, end, { state:{ seed, blockSize:1, next:'-1' } }));
console.log('BLOCKS: 71-bit scheduling resumes identically with bounded state and no stored block list');
console.log('BLOCKS: ALL CHECKS PASSED');

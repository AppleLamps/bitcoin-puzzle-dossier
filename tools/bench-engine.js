// Benchmark: old BigInt lane loop vs new limb-field lane loop, per worker-thread.
// Run: node tools/bench-engine.js [secondsPerRun]
'use strict';
const C = require('../js/crypto.js').PuzzleCrypto;

const secs = Number(process.argv[2]) || 3;

function benchOld(lanes, ms){
  const pts = [];
  for(let i = 0; i < lanes; i++) pts.push(C.mulG(1000n + BigInt(i)));
  const buf = new Uint8Array(33);
  const t0 = Date.now();
  let n = 0;
  while(Date.now() - t0 < ms){
    C.batchAddG(pts);
    for(let j = 0; j < lanes; j++) C.hash160(C.compressed(pts[j], buf));
    n += lanes;
  }
  return n / ((Date.now() - t0) / 1000);
}

function benchNew(lanes, ms){
  const xs = new Uint32Array(lanes * 8), ys = new Uint32Array(lanes * 8);
  for(let i = 0; i < lanes; i++) C.pointToLimbs(xs, ys, i, C.mulG(1000n + BigInt(i)));
  const t0 = Date.now();
  let n = 0;
  while(Date.now() - t0 < ms){
    for(let j = 0; j < lanes; j++) C.hash160x(xs, ys, j);
    n += lanes;
    C.batchAddGL(xs, ys, lanes);
  }
  return n / ((Date.now() - t0) / 1000);
}

const ms = secs * 1000;
const fmt = v => Math.round(v).toLocaleString('en-US');

console.log('old engine (BigInt batchAddG + generic hash160), 128 lanes:');
const oldRate = benchOld(128, ms);
console.log('  ' + fmt(oldRate) + ' keys/s');

console.log('new engine (limb batchAddGL + specialized hash160_33):');
let best = { lanes: 0, rate: 0 };
for(const lanes of [64, 128, 256, 512, 1024]){
  const rate = benchNew(lanes, ms);
  console.log('  ' + String(lanes).padStart(4) + ' lanes: ' + fmt(rate) + ' keys/s  (' + (rate / oldRate).toFixed(2) + 'x)');
  if(rate > best.rate) best = { lanes, rate };
}
console.log('\nbest: ' + best.lanes + ' lanes at ' + fmt(best.rate) + ' keys/s — ' + (best.rate / oldRate).toFixed(2) + 'x the old engine');

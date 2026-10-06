// End-to-end test of js/cracker-worker.js under a shimmed worker scope.
// Drives the real message protocol: start -> progress -> found / stopped -> resume.
// Run: node tools/test-worker.js
'use strict';
const path = require('path');

let failures = 0;
function ok(cond, label){
  if(!cond){ failures++; console.error('FAIL: ' + label); }
  else console.log('ok: ' + label);
}

function makeWorker(options = {}){
  const outbox = [];
  const scope = {
    postMessage: msg => outbox.push(msg),
    setTimeout, clearTimeout, Date, Math, JSON, console,
    Uint8Array, Uint32Array, Int32Array, BigInt, Array, Object, String, Number, Infinity, isFinite,
    crypto: options.crypto || globalThis.crypto
  };
  scope.self = scope;
  const fs = require('fs');
  const src = fs.readFileSync(path.resolve(__dirname, '../js/cracker-worker.js'), 'utf8');
  const vm = require('vm');
  vm.createContext(scope);
  scope.importScripts = p => {
    if(p === 'crypto.js'){
      scope.PuzzleCrypto = { ...require(path.resolve(__dirname, '../js', p)).PuzzleCrypto };
      if(options.engine) Object.assign(scope.PuzzleCrypto, options.engine);
    } else vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../js', p), 'utf8'), scope);
  };
  vm.runInContext(src, scope);
  return {
    postMessage: msg => scope.onmessage({ data: msg }),
    nextMessage: (pred, timeoutMs = 30000) => new Promise((res, rej) => {
      const t0 = Date.now();
      (function poll(){
        const i = outbox.findIndex(pred);
        if(i >= 0) return res(outbox.splice(i, 1)[0]);
        if(Date.now() - t0 > timeoutMs) return rej(new Error('timeout waiting for message'));
        setTimeout(poll, 5);
      })();
    })
  };
}

(async () => {
  const C = require('../js/crypto.js').PuzzleCrypto;

  // --- sequential scan finds a planted key ---
  {
    const w = makeWorker();
    const start = 1n << 64n;
    const secret = start + 123456n;
    const target = C.hash160(C.compressed(C.mulG(secret)));
    w.postMessage({ type: 'start', target: target.buffer.slice(0), start: start.toString(), end: (start + 300000n).toString(), mode: 'sequential' });
    const msg = await w.nextMessage(m => m.type === 'found');
    ok(msg.key === secret.toString(16), 'sequential: found planted key 0x' + secret.toString(16));
    ok(msg.wif === C.privToWIF(secret), 'sequential: WIF matches');
    ok(msg.address === C.hash160ToAddress(target), 'sequential: address matches target');
  }

  // --- stop mid-run, then resume from the saved map and still find the key ---
  {
    const w = makeWorker();
    const start = 1n << 60n;
    const secret = start + 900000n; // deep enough that the stop lands first
    const target = C.hash160(C.compressed(C.mulG(secret)));
    w.postMessage({ type: 'start', target: target.buffer.slice(0), start: start.toString(), end: (start + 1000000n).toString(), mode: 'sequential' });
    await w.nextMessage(m => m.type === 'progress');
    w.postMessage({ type: 'stop' });
    const stopped = await w.nextMessage(m => m.type === 'stopped');
    ok(!!stopped.resume && Object.keys(stopped.resume).length > 0, 'stop: resume map returned (' + Object.keys(stopped.resume).length + ' lanes)');
    const checkedBefore = BigInt(stopped.checked);
    ok(checkedBefore > 0n, 'stop: made progress before stopping');

    const w2 = makeWorker();
    w2.postMessage({ type: 'start', target: target.buffer.slice(0), start: start.toString(), end: (start + 1000000n).toString(), mode: 'sequential', resumeKeys: stopped.resume });
    const msg = await w2.nextMessage(m => m.type === 'found');
    ok(msg.key === secret.toString(16), 'resume: found planted key after stop/resume');
    // no double-counting: resumed run re-checks nothing already reported
    ok(BigInt(msg.checked) <= 1000001n - checkedBefore + 256n, 'resume: total coverage stays within the span');
  }

  // --- exhaustion on a range without the key ---
  {
    const w = makeWorker();
    const target = C.hash160(C.compressed(C.mulG(0xDEADBEEFn)));
    const start = 1n << 40n;
    w.postMessage({ type: 'start', target: target.buffer.slice(0), start: start.toString(), end: (start + 10000n).toString(), mode: 'sequential' });
    const msg = await w.nextMessage(m => m.type === 'exhausted');
    ok(BigInt(msg.checked) === 10001n, 'exhausted: checked exactly the whole span (' + msg.checked + ')');
  }

  // --- bench message round-trips ---
  {
    const w = makeWorker();
    w.postMessage({ type: 'bench', ms: 500 });
    const msg = await w.nextMessage(m => m.type === 'bench');
    ok(msg.keys > 0 && msg.ms >= 500, 'bench: reported ' + Math.round(msg.keys / (msg.ms / 1000)).toLocaleString('en-US') + ' keys/s');
  }

  // Tiny random intervals exhaust instead of walking outside the range.
  {
    const w = makeWorker({ crypto: { getRandomValues(bytes){ bytes.fill(0); bytes[31] = 3; return bytes; } } });
    const target = C.hash160(C.compressed(C.mulG(5n)));
    w.postMessage({ type: 'start', target: target.buffer.slice(0), start: '1', end: '4', mode: 'random' });
    const msg = await w.nextMessage(m => m.type === 'found' || m.type === 'exhausted');
    ok(msg.type === 'exhausted' && msg.checked === '4', 'random: tests all four keys once and stays in range');
  }

  // Real curve/hash math still recovers a planted key with randomized block order.
  {
    const start = 1n << 70n, secret = start + 123456n;
    const target = C.hash160(C.compressed(C.mulG(secret)));
    const w = makeWorker();
    w.postMessage({ type:'start', target:target.buffer.slice(0), start:String(start), end:String(start + 300000n), mode:'random', blockSize:128 });
    const found = await w.nextMessage(m => m.type === 'found');
    ok(found.key === secret.toString(16) && found.address === C.hash160ToAddress(target), 'random: real 71-bit planted key recovered and verified');
  }

  // Record every visited candidate using a counting engine. This isolates the
  // scheduler from the real crypto tests above and catches overlaps/gaps even
  // when the total count happens to equal the interval length.
  function countingEngine(visited){
    return {
      mulG: key => [key, 0n],
      hash160x(xs, ys, i){ visited.push(C.FastField.fToBig(xs.subarray(i*8, i*8+8))); return [1,1,1,1,1]; },
      batchAddGL(xs, ys, n){
        for(let i=0;i<n;i++){
          const x = xs.subarray(i*8, i*8+8);
          C.FastField.fFromBig(C.FastField.fToBig(x) + 1n, x);
        }
      }
    };
  }
  for(const [length, blockSize] of [[513,1], [1009,3], [4099,16]]){
    const visited = [], w = makeWorker({ engine:countingEngine(visited) });
    w.postMessage({ type:'start', target:new ArrayBuffer(20), start:'1', end:String(length), mode:'random', blockSize });
    const exhausted = await w.nextMessage(m => m.type === 'exhausted');
    ok(Number(exhausted.checked) === length, 'random: exact count on ' + length + ' candidates');
    ok(new Set(visited).size === length && visited.every(k => k >= 1n && k <= BigInt(length)), 'random: every candidate visited exactly once including the partial block');
  }
  {
    const visited = [], start = 1n << 70n, length = 1000001n;
    const parameters = { type:'start', target:new ArrayBuffer(20), start:String(start), end:String(start + length - 1n), mode:'random', blockSize:1024 };
    const w = makeWorker({ engine:countingEngine(visited) });
    w.postMessage(parameters);
    await w.nextMessage(m => m.type === 'progress');
    w.postMessage({ type:'stop' });
    const stopped = await w.nextMessage(m => m.type === 'stopped');
    ok(!!stopped.resume.order.seed && stopped.resume.lanes.length > 0, 'random: seed, block cursor, and unfinished lanes checkpointed');
    const w2 = makeWorker({ engine:countingEngine(visited) });
    w2.postMessage({ ...parameters, resumeRandom:stopped.resume });
    const exhausted = await w2.nextMessage(m => m.type === 'exhausted');
    ok(BigInt(stopped.checked) + BigInt(exhausted.checked) === length, 'random resume: counts add up to the complete sweep');
    ok(visited.length === Number(length) && new Set(visited).size === Number(length), 'random resume: no key repeated or skipped after stopping mid-block');
    ok(visited.every(k => k >= start && k < start + length), 'random resume: every key remains inside the 71-bit interval');
  }

  // The real random benchmark includes block initialization and scheduling.
  {
    const w = makeWorker(); w.postMessage({ type:'bench', ms:500, mode:'random' });
    const msg = await w.nextMessage(m => m.type === 'bench');
    ok(msg.keys > 0 && msg.ms >= 500, 'random benchmark: actual worker scan measured');
  }

  // Exercise intervals smaller than the lane count and uneven partitions.
  for(const length of [1n, 2n, 255n, 256n, 257n, 513n]){
    const w = makeWorker();
    const target = C.hash160(C.compressed(C.mulG(999999n)));
    w.postMessage({ type: 'start', target: target.buffer.slice(0), start: '1', end: String(length), mode: 'sequential' });
    const msg = await w.nextMessage(m => m.type === 'exhausted');
    ok(BigInt(msg.checked) === length, 'sequential: checks exactly ' + length + ' keys on a tiny/uneven range');
  }

  console.log(failures === 0 ? '\nWORKER: ALL CHECKS PASSED' : '\nWORKER: ' + failures + ' CHECKS FAILED');
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });

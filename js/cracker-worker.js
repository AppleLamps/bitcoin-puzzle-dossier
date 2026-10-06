// Brute-force worker: walks private keys inside an interval, hashes each compressed public key,
// and reports the private key the moment its hash160 matches the target.
// Engine: 8x32 limb field arithmetic with one batched inversion per round, plus a fused
// single-block SHA-256+RIPEMD-160 that reads lane coordinates directly (see crypto.js).
// Messages in:  {type:'start', target, start, end, mode, resumeKeys?}  {type:'stop'}  {type:'bench', ms}
// Messages out: progress | found | exhausted | stopped (with per-lane keys so a run can resume) | bench
importScripts('crypto.js');
var C = self.PuzzleCrypto;
var running = false, stopRequested = false;
var LANES = 256;
var SAFE = 9007199254740991; // lanes longer than this never finish in practice; treat as unbounded

function randomBig(limit){
  var bytes = new Uint8Array(32); crypto.getRandomValues(bytes);
  var r = 0n; for(var i=0;i<32;i++) r = (r<<8n) | BigInt(bytes[i]);
  return r % limit;
}

self.onmessage = function(e){
  var m = e.data;
  if(m.type === 'stop'){ stopRequested = true; return; }
  if(m.type === 'bench'){ if(!running) bench(m.ms || 3000); return; }
  if(m.type !== 'start' || running) return;
  run(m);
};

function bench(ms){
  var xs = new Uint32Array(LANES*8), ys = new Uint32Array(LANES*8);
  for(var i=0;i<LANES;i++) C.pointToLimbs(xs, ys, i, C.mulG(1000n + BigInt(i)));
  var t0 = Date.now(), n = 0;
  while(Date.now() - t0 < ms){
    for(var j=0;j<LANES;j++) C.hash160x(xs, ys, j);
    n += LANES;
    C.batchAddGL(xs, ys, LANES);
  }
  self.postMessage({ type:'bench', keys:n, ms:Date.now() - t0 });
}

function run(m){
  running = true; stopRequested = false;
  var target = new Uint8Array(m.target);
  // hash160x emits five little-endian int32 words; pre-split the target the same way.
  var tw0=target[0]|target[1]<<8|target[2]<<16|target[3]<<24,  tw1=target[4]|target[5]<<8|target[6]<<16|target[7]<<24,
      tw2=target[8]|target[9]<<8|target[10]<<16|target[11]<<24, tw3=target[12]|target[13]<<8|target[14]<<16|target[15]<<24,
      tw4=target[16]|target[17]<<8|target[18]<<16|target[19]<<24;
  var start = BigInt(m.start), end = BigInt(m.end);
  var mode = m.mode;                       // 'sequential' | 'random'
  var span = end - start + 1n;
  var stride = span / BigInt(LANES); if(stride < 1n) stride = 1n;
  var xs = new Uint32Array(LANES*8), ys = new Uint32Array(LANES*8);
  var base = new Array(LANES), steps = new Array(LANES), laneMax = new Array(LANES), laneIdx = new Array(LANES);
  // Per lane: point lives in xs/ys slot; key = base + steps (Number counter, BigInt only on report).
  var active = 0;
  var checked = 0, lastReport = Date.now();
  var RESEED_AFTER = 4096;

  function laneEnd(i){ return i === LANES - 1 ? end : start + BigInt(i+1)*stride - 1n; }
  function addLane(k, maxSteps, idx){
    C.pointToLimbs(xs, ys, active, C.mulG(k));
    base[active] = k; steps[active] = 0; laneMax[active] = maxSteps; laneIdx[active] = idx;
    active++;
  }
  function seedRandomLane(i){
    var k = start + randomBig(span);
    C.pointToLimbs(xs, ys, i, C.mulG(k));
    base[i] = k; steps[i] = 0;
    // Stop each random walk at the interval boundary, even on tiny ranges.
    var remaining = end - k + 1n;
    laneMax[i] = remaining < BigInt(RESEED_AFTER) ? Number(remaining) : RESEED_AFTER;
  }
  function seedLanes(resume){
    active = 0;
    if(mode === 'random'){
      for(var i=0;i<LANES;i++){ seedRandomLane(i); laneIdx[i] = i; active++; }
      return;
    }
    for(i=0;i<LANES;i++){
      if(resume && resume[i] === undefined) continue; // this lane already finished before the stop
      var k2 = resume ? BigInt('0x' + resume[i]) : start + BigInt(i)*stride;
      var le = laneEnd(i);
      if(k2 > le || k2 > end) continue;
      var len = le - k2 + 1n; // keys this lane will test, current one included
      addLane(k2, len > BigInt(SAFE) ? Infinity : Number(len), i);
    }
  }
  function keyAt(i){ return base[i] + BigInt(steps[i]); }
  function snapshot(){ var map = {}; for(var i=0;i<active;i++) map[laneIdx[i]] = keyAt(i).toString(16); return map; }
  function minKeyHex(){ var mn = null; for(var i=0;i<active;i++){ var k = keyAt(i); if(mn === null || k < mn) mn = k; } return (mn === null ? 0n : mn).toString(16); }
  function removeLane(i){ // swap-remove with the last active lane; lane order is meaningless
    var last = --active;
    if(i !== last){
      xs.set(xs.subarray(last*8, last*8+8), i*8);
      ys.set(ys.subarray(last*8, last*8+8), i*8);
      base[i] = base[last]; steps[i] = steps[last]; laneMax[i] = laneMax[last]; laneIdx[i] = laneIdx[last];
    }
  }

  seedLanes(m.resumeKeys);
  if(!active){ running = false; self.postMessage({ type:'exhausted', checked:'0' }); return; }

  function tick(){
    if(stopRequested){
      running = false;
      // Sequential resume needs every lane's position under its original slot index.
      self.postMessage({ type:'stopped', checked:String(checked), resume: mode === 'sequential' ? snapshot() : null, current:minKeyHex() });
      return;
    }
    for(var round=0; round<8; round++){
      for(var i=0;i<active;i++){
        var w = C.hash160x(xs, ys, i);
        checked++;
        if(w[0]===tw0 && w[1]===tw1 && w[2]===tw2 && w[3]===tw3 && w[4]===tw4){
          running = false;
          var k = keyAt(i), pt = C.mulG(k); // re-verify through the independent BigInt path
          self.postMessage({ type:'found', key:k.toString(16), wif:C.privToWIF(k), address:C.hash160ToAddress(C.hash160(C.compressed(pt))), checked:String(checked) });
          return;
        }
      }
      C.batchAddGL(xs, ys, active);
      for(i=active-1;i>=0;i--){
        steps[i]++;
        if(steps[i] >= laneMax[i]){
          if(mode === 'random') seedRandomLane(i); else removeLane(i);
        }
      }
      if(!active){ running = false; self.postMessage({ type:'exhausted', checked:String(checked) }); return; }
    }
    var now = Date.now();
    if(now - lastReport >= 250){ lastReport = now; self.postMessage({ type:'progress', checked:String(checked), current:minKeyHex(), lanes:active }); }
    setTimeout(tick, 0);
  }
  tick();
}

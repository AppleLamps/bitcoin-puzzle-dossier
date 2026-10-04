// Brute-force worker: walks private keys inside a puzzle range, hashes each compressed
// public key, and reports the private key the moment its hash160 matches the target.
importScripts('crypto.js');
var C = self.PuzzleCrypto;
var running = false;

function keyAt(pt){ return pt; }

self.onmessage = function(e){
  var m = e.data;
  if(m.type === 'stop'){ running = false; return; }
  if(m.type !== 'start') return;
  running = true;
  var target = new Uint8Array(m.target);          // hash160 of the puzzle address
  var start = BigInt(m.start), end = BigInt(m.end); // inclusive bounds for this worker
  var mode = m.mode;                              // 'sequential' | 'random'
  var LANES = 128;
  var span = end - start + 1n;
  var lanes = [], keys = [];
  var buf = new Uint8Array(33);
  var checked = 0n, lastReport = Date.now(), reportEvery = 250;

  function randomBig(limit){ // uniform-ish random BigInt in [0, limit)
    var bytes = new Uint8Array(32); crypto.getRandomValues(bytes);
    var r = 0n; for(var i=0;i<32;i++) r = (r<<8n) | BigInt(bytes[i]);
    return r % limit;
  }
  function seedLanes(){
    lanes.length = 0; keys.length = 0;
    if(mode === 'random'){
      for(var i=0;i<LANES;i++){ var k = start + randomBig(span); keys.push(k); lanes.push(C.mulG(k)); }
    } else {
      // Sequential: lane i covers a contiguous slice [start + i*stride, ...)
      var stride = span / BigInt(LANES); if(stride < 1n) stride = 1n;
      for(i=0;i<LANES;i++){ var k2 = start + BigInt(i)*stride; if(k2 > end) break; keys.push(k2); lanes.push(C.mulG(k2)); }
    }
  }
  function matches(h){ for(var i=0;i<20;i++) if(h[i]!==target[i]) return false; return true; }
  function found(k){
    running = false;
    var pt = C.mulG(k);
    self.postMessage({ type:'found', key:k.toString(16), wif:C.privToWIF(k), address:C.hash160ToAddress(C.hash160(C.compressed(pt))), checked:checked.toString() });
  }
  seedLanes();
  var stride = span / BigInt(LANES); if(stride < 1n) stride = 1n;
  var RESEED_AFTER = 4096; // random mode: hop to fresh random starting points periodically
  var sinceSeed = 0;

  function tick(){
    if(!running) return;
    for(var round=0; round<16 && running; round++){
      // Check current lane points, then advance every lane by +G in one batched step.
      for(var i=0;i<lanes.length;i++){
        var h = C.hash160(C.compressed(lanes[i], buf));
        checked++;
        if(matches(h)){ found(keys[i]); return; }
      }
      C.batchAddG(lanes);
      for(i=0;i<lanes.length;i++){
        keys[i] += 1n;
        if(mode === 'sequential'){
          var laneEnd = (i === lanes.length-1) ? end : start + BigInt(i+1)*stride - 1n;
          if(keys[i] > laneEnd){ lanes.splice(i,1); keys.splice(i,1); i--; }
        }
      }
      if(mode === 'random' && ++sinceSeed >= RESEED_AFTER){ sinceSeed = 0; seedLanes(); }
      if(lanes.length === 0){ running = false; self.postMessage({ type:'exhausted', checked:checked.toString() }); return; }
    }
    var now = Date.now();
    if(now - lastReport >= reportEvery){ lastReport = now; self.postMessage({ type:'progress', checked:checked.toString(), current:keys[0].toString(16) }); }
    setTimeout(tick, 0);
  }
  tick();
};

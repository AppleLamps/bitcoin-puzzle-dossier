// Brute-force worker: walks private keys inside an interval, hashes each compressed public key,
// and reports the private key the moment its hash160 matches the target.
// Messages in:  {type:'start', target, start, end, mode, resumeKeys?}  {type:'stop'}  {type:'bench', ms}
// Messages out: progress | found | exhausted | stopped (with per-lane keys so a run can resume) | bench
importScripts('crypto.js');
var C = self.PuzzleCrypto;
var running = false, stopRequested = false;
var LANES = 128;

function randomBig(limit){
  var bytes = new Uint8Array(32); crypto.getRandomValues(bytes);
  var r = 0n; for(var i=0;i<32;i++) r = (r<<8n) | BigInt(bytes[i]);
  return r % limit;
}

self.onmessage = function(e){
  var m = e.data;
  if(m.type === 'stop'){ stopRequested = true; return; }
  if(m.type === 'bench'){ bench(m.ms || 3000); return; }
  if(m.type !== 'start') return;
  run(m);
};

function bench(ms){
  var lanes = []; for(var i=0;i<LANES;i++) lanes.push(C.mulG(1000n + BigInt(i)));
  var buf = new Uint8Array(33), t0 = Date.now(), n = 0;
  while(Date.now() - t0 < ms){ C.batchAddG(lanes); for(var j=0;j<lanes.length;j++){ C.hash160(C.compressed(lanes[j], buf)); } n += lanes.length; }
  self.postMessage({ type:'bench', keys:n, ms:Date.now() - t0 });
}

function run(m){
  running = true; stopRequested = false;
  var target = new Uint8Array(m.target);
  var start = BigInt(m.start), end = BigInt(m.end);
  var mode = m.mode;                       // 'sequential' | 'random'
  var span = end - start + 1n;
  var stride = span / BigInt(LANES); if(stride < 1n) stride = 1n;
  var lanes = [], keys = [], laneEnds = [];
  var buf = new Uint8Array(33);
  var checked = 0n, lastReport = Date.now();
  var sinceSeed = 0, RESEED_AFTER = 4096;

  function laneEnd(i){ return i === LANES - 1 ? end : start + BigInt(i+1)*stride - 1n; }
  function seedLanes(resume){
    lanes.length = 0; keys.length = 0; laneEnds.length = 0;
    if(mode === 'random'){
      for(var i=0;i<LANES;i++){ var k = start + randomBig(span); keys.push(k); lanes.push(C.mulG(k)); laneEnds.push(end); }
      return;
    }
    for(i=0;i<LANES;i++){
      if(resume && resume[i] === undefined) continue; // this lane already finished before the stop
      var k2 = resume ? BigInt('0x' + resume[i]) : start + BigInt(i)*stride;
      var le = laneEnd(i);
      if(k2 > le || k2 > end) continue;
      keys.push(k2); lanes.push(C.mulG(k2)); laneEnds.push(le);
    }
  }
  function matches(h){ for(var i=0;i<20;i++) if(h[i]!==target[i]) return false; return true; }
  function snapshot(){ return keys.map(function(k){ return k.toString(16); }); }
  function minKey(){ var mn = null; for(var i=0;i<keys.length;i++) if(mn === null || keys[i] < mn) mn = keys[i]; return mn; }

  seedLanes(m.resumeKeys);
  if(!lanes.length){ running = false; self.postMessage({ type:'exhausted', checked:'0' }); return; }

  function tick(){
    if(stopRequested){
      running = false;
      // Sequential resume needs every lane's position in its original slot, so rebuild the full 128-wide map.
      var map = {};
      if(mode === 'sequential'){ for(var i=0;i<keys.length;i++){ map[Number((keys[i] - start) / stride)] = keys[i].toString(16); } }
      self.postMessage({ type:'stopped', checked:checked.toString(), resume: mode === 'sequential' ? map : null, current:(minKey()||0n).toString(16) });
      return;
    }
    for(var round=0; round<16; round++){
      for(var i=0;i<lanes.length;i++){
        var h = C.hash160(C.compressed(lanes[i], buf));
        checked++;
        if(matches(h)){
          running = false;
          var k = keys[i], pt = C.mulG(k);
          self.postMessage({ type:'found', key:k.toString(16), wif:C.privToWIF(k), address:C.hash160ToAddress(C.hash160(C.compressed(pt))), checked:checked.toString() });
          return;
        }
      }
      C.batchAddG(lanes);
      for(i=0;i<lanes.length;i++){
        keys[i] += 1n;
        if(mode === 'sequential' && keys[i] > laneEnds[i]){ lanes.splice(i,1); keys.splice(i,1); laneEnds.splice(i,1); i--; }
      }
      if(mode === 'random' && ++sinceSeed >= RESEED_AFTER){ sinceSeed = 0; seedLanes(); }
      if(lanes.length === 0){ running = false; self.postMessage({ type:'exhausted', checked:checked.toString() }); return; }
    }
    var now = Date.now();
    if(now - lastReport >= 250){ lastReport = now; self.postMessage({ type:'progress', checked:checked.toString(), current:(minKey()||0n).toString(16), lanes:lanes.length }); }
    setTimeout(tick, 0);
  }
  tick();
}

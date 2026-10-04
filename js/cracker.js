// In-browser puzzle cracker UI. Spawns one worker per core and splits the key range between them.
(function(){
  var D = window.PuzzleData, C = window.PuzzleCrypto;
  var el = {}, workers = [], running = false, startedAt = 0, totals = [], tickTimer = null, currentPuzzle = null;
  function $(id){ return document.getElementById(id); }
  function fmt(n){ return Number(n).toLocaleString('en-US'); }
  function fmtBig(b){ return BigInt(b).toLocaleString('en-US'); }

  function fillPuzzleSelect(){
    var opts = [];
    for(var n=1;n<=160;n++){
      var it = D.item(n);
      var tag = it.state === 'open' ? 'OPEN · ' + it.balance + ' BTC' : it.state === 'solved' ? 'solved ' + it.solveDate : 'pre-used';
      opts.push('<option value="' + n + '"' + (n===5?' selected':'') + '>#' + n + ' · ' + n + '-bit · ' + tag + '</option>');
    }
    el.puzzle.innerHTML = opts.join('');
  }
  function describe(){
    var n = Number(el.puzzle.value), it = D.item(n), r = D.rangeHex(n);
    currentPuzzle = it;
    var size = BigInt(D.keyspaceSize(n));
    var rate = 150000 * Math.max(1, (navigator.hardwareConcurrency || 2));
    var secs = Number(size) / rate;
    var eta = secs < 1 ? 'under a second' : secs < 60 ? Math.round(secs) + ' s' : secs < 3600 ? Math.round(secs/60) + ' min' : secs < 86400 ? (secs/3600).toFixed(1) + ' h' : secs < 3.15e7 ? (secs/86400).toFixed(1) + ' days' : (secs/3.15e7).toExponential(2) + ' years';
    el.target.textContent = it.address;
    el.target.href = 'https://mempool.space/address/' + it.address;
    el.range.textContent = '0x' + r.start + ' → 0x' + r.end;
    el.space.textContent = fmtBig(size) + ' keys (2^' + (n-1) + ')';
    el.eta.textContent = 'Full sweep on this device at ~' + fmt(rate) + ' keys/s: ' + eta + (it.state === 'solved' ? ' · already solved, so a hit proves the engine works' : it.state === 'open' ? ' · unsolved, prize ' + it.balance + ' BTC' : '');
    el.custom.placeholder = r.start;
    var customOk = el.mode.value === 'custom';
    el.customWrap.hidden = !customOk;
  }
  function setStatus(txt, cls){ el.status.textContent = txt; el.status.className = 'cracker-status' + (cls ? ' ' + cls : ''); }
  function stop(reason){
    running = false;
    workers.forEach(function(w){ w.terminate(); }); workers = [];
    clearInterval(tickTimer);
    el.start.hidden = false; el.stop.hidden = true;
    el.puzzle.disabled = el.mode.disabled = el.custom.disabled = false;
    if(reason) setStatus(reason, 'idle');
  }
  function totalChecked(){ return totals.reduce(function(a,b){ return a + b; }, 0n); }
  function tick(){
    var t = totalChecked(), secs = (Date.now() - startedAt) / 1000;
    el.checked.textContent = t.toLocaleString('en-US');
    el.rate.textContent = secs > 0 ? fmt(Math.round(Number(t) / secs)) + ' keys/s' : '—';
    el.elapsed.textContent = secs < 60 ? secs.toFixed(0) + ' s' : Math.floor(secs/60) + ' min ' + Math.floor(secs%60) + ' s';
    if(currentPuzzle){
      var size = Number(BigInt(D.keyspaceSize(currentPuzzle.n)));
      var pct = Number(t) / size * 100;
      el.progress.style.width = Math.min(100, pct) + '%';
      el.pct.textContent = pct >= 0.01 ? pct.toFixed(2) + '%' : pct.toExponential(2) + '%';
    }
  }
  function showResult(msg){
    el.result.hidden = false;
    el.resultBody.innerHTML =
      '<div class="found-banner">PRIVATE KEY FOUND · PUZZLE #' + currentPuzzle.n + '</div>' +
      '<dl class="modal-facts">' +
      '<dt>Private key (hex)</dt><dd class="mono"><code>' + C.hex64(BigInt('0x' + msg.key)) + '</code></dd>' +
      '<dt>Private key (decimal)</dt><dd class="mono">' + BigInt('0x' + msg.key).toString() + '</dd>' +
      '<dt>WIF (compressed)</dt><dd class="mono"><code>' + msg.wif + '</code></dd>' +
      '<dt>Derived address</dt><dd class="mono">' + msg.address + (msg.address === currentPuzzle.address ? ' <span class="state state-open">MATCH</span>' : ' <span class="state state-retired">MISMATCH</span>') + '</dd>' +
      '<dt>Keys checked</dt><dd class="mono">' + fmtBig(msg.checked) + ' <small>by the thread that found it</small></dd>' +
      '</dl>' +
      '<p class="modal-foot">' + (currentPuzzle.state === 'open'
        ? 'This lot is unsolved and holds ' + currentPuzzle.balance + ' BTC. Import the WIF into a wallet you control and sweep it immediately: anyone else who finds this key can take the funds, and solved puzzle keys have been front-run in the mempool before. Consider broadcasting through a private relay.'
        : 'This lot was already solved on ' + currentPuzzle.solveDate + ' and holds no balance. The key above is real and re-derived locally, which is how you can tell the engine is doing genuine work.') + '</p>';
    el.result.scrollIntoView({ behavior:'smooth', block:'nearest' });
  }
  function start(){
    if(running) return;
    var n = Number(el.puzzle.value), it = D.item(n);
    if(!it.address){ setStatus('Unknown puzzle', 'bad'); return; }
    var target;
    try { target = C.addressToHash160(it.address); } catch(err){ setStatus('Could not decode address: ' + err.message, 'bad'); return; }
    var lo = 1n << BigInt(n-1), hi = (1n << BigInt(n)) - 1n;
    var mode = el.mode.value;
    if(mode === 'custom'){
      var raw = el.custom.value.trim().replace(/^0x/i, '');
      if(!/^[0-9a-f]+$/i.test(raw)){ setStatus('Enter a hex start key inside the range', 'bad'); return; }
      var s = BigInt('0x' + raw);
      if(s < lo || s > hi){ setStatus('Start key is outside this puzzle’s range', 'bad'); return; }
      lo = s; mode = 'sequential';
    }
    var cores = Math.max(1, Math.min(16, navigator.hardwareConcurrency || 2));
    var span = hi - lo + 1n;
    if(span < BigInt(cores) * 256n) cores = 1;
    var chunk = span / BigInt(cores);
    el.result.hidden = true;
    totals = []; workers = []; running = true; startedAt = Date.now();
    el.start.hidden = true; el.stop.hidden = false;
    el.puzzle.disabled = el.mode.disabled = el.custom.disabled = true;
    el.workers.textContent = cores + (cores === 1 ? ' worker' : ' workers');
    setStatus('Running · ' + (mode === 'random' ? 'random sampling' : 'sequential sweep') + ' across ' + cores + ' thread' + (cores>1?'s':''), 'run');
    var exhausted = 0;
    for(var i=0;i<cores;i++){
      (function(idx){
        var w = new Worker('js/cracker-worker.js');
        var wStart = lo + BigInt(idx) * chunk;
        var wEnd = idx === cores-1 ? hi : wStart + chunk - 1n;
        totals[idx] = 0n;
        w.onmessage = function(e){
          var m = e.data;
          if(m.type === 'progress'){ totals[idx] = BigInt(m.checked); el.current.textContent = '0x' + m.current; }
          else if(m.type === 'found'){ totals[idx] = BigInt(m.checked); tick(); stop('Found. Private key shown below.'); el.status.className = 'cracker-status found'; showResult(m); }
          else if(m.type === 'exhausted'){ totals[idx] = BigInt(m.checked); if(++exhausted >= cores){ tick(); stop('Range exhausted with no match. The address does not belong to this interval, or the start point skipped it.'); } }
        };
        w.onerror = function(err){ stop('Worker error: ' + err.message); };
        w.postMessage({ type:'start', target:target.buffer.slice(target.byteOffset, target.byteOffset + 20), start:wStart.toString(), end:wEnd.toString(), mode:mode });
        workers.push(w);
      }(i));
    }
    tickTimer = setInterval(tick, 300);
  }
  document.addEventListener('DOMContentLoaded', function(){
    ['puzzle','mode','custom','customWrap','start','stop','status','target','range','space','eta','checked','rate','elapsed','workers','current','progress','pct','result','resultBody'].forEach(function(k){ el[k] = $('crk-' + k); });
    if(!el.puzzle) return;
    if(typeof Worker === 'undefined' || typeof BigInt === 'undefined'){ setStatus('This browser lacks Web Workers or BigInt; the cracker cannot run here.', 'bad'); el.start.disabled = true; return; }
    fillPuzzleSelect(); describe();
    el.puzzle.addEventListener('change', describe);
    el.mode.addEventListener('change', describe);
    el.start.addEventListener('click', start);
    el.stop.addEventListener('click', function(){ tick(); stop('Stopped by user.'); });
    var preset = location.hash.match(/^#crack-(\d+)$/);
    if(preset){ el.puzzle.value = preset[1]; describe(); }
  });
  window.Cracker = { start:start, stop:stop };
}());

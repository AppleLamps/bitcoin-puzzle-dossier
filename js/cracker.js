// Web cracker controller: puzzle picker, thread pool, benchmark, pause/resume, live stats, verified result.
(function(){
  var D = window.PuzzleData, C = window.PuzzleCrypto;
  var el = {}, workers = [], running = false, startedAt = 0, pausedElapsed = 0, totals = [], tickTimer = null;
  var current = null;          // {n, item, lo, hi, mode, cores, chunk}
  var resumeState = null;      // per-worker resume maps after a stop
  var bench = null;            // {rate, threads}: measured keys/s and the thread count it was measured on
  var busy = false;            // true while a benchmark is running
  var MAX_CORES = Math.max(1, Math.min(32, navigator.hardwareConcurrency || 2));
  var PER_CORE_GUESS = 110000;

  function $(id){ return document.getElementById(id); }
  function fmt(n){ return Number(n).toLocaleString('en-US'); }
  function fmtBig(b){ return BigInt(b).toLocaleString('en-US'); }
  function esc(s){ return String(s).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function dur(secs){
    if(!isFinite(secs)) return '—';
    if(secs < 1) return 'under a second';
    if(secs < 60) return Math.round(secs) + ' s';
    if(secs < 3600) return Math.floor(secs/60) + ' min ' + Math.round(secs%60) + ' s';
    if(secs < 86400) return (secs/3600).toFixed(1) + ' h';
    if(secs < 3.15e7) return (secs/86400).toFixed(1) + ' days';
    if(secs < 3.15e10) return fmt(Math.round(secs/3.15e7)) + ' years';
    return (secs/3.15e7).toExponential(2) + ' years';
  }
  function log(msg, cls){
    var li = document.createElement('li');
    li.className = cls || '';
    li.innerHTML = '<time>' + new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', second:'2-digit'}) + '</time><span>' + msg + '</span>';
    el.log.insertBefore(li, el.log.firstChild);
    while(el.log.children.length > 40) el.log.removeChild(el.log.lastChild);
  }
  function setStatus(txt, cls){ el.status.textContent = txt; el.status.className = 'cracker-status ' + (cls || 'idle'); }
  function threadsSelected(){ return Number(el.threads.value) || MAX_CORES; }
  function expectedRate(){ return bench ? bench.rate / bench.threads * threadsSelected() : PER_CORE_GUESS * threadsSelected(); }

  function fillSelects(){
    var verify = [], open = [], pub = [];
    for(var n=1;n<=160;n++){
      var it = D.item(n);
      var label = '#' + n + ' · ' + n + '-bit · ' + (it.state === 'open' ? it.balance + ' BTC' : it.state === 'solved' ? 'solved ' + it.solveDate : 'pre-used');
      var o = '<option value="' + n + '">' + label + (it.publicKey && it.state === 'open' ? ' · public key' : '') + '</option>';
      if(it.state === 'open'){ (it.publicKey ? pub : open).push(o); } else verify.push(o);
    }
    el.puzzle.innerHTML = '<optgroup label="Verify the engine (already solved, no prize)">' + verify.join('') + '</optgroup>' +
      '<optgroup label="Open lots, address only (brute force)">' + open.join('') + '</optgroup>' +
      '<optgroup label="Open lots, public key exposed (kangaroo territory)">' + pub.join('') + '</optgroup>';
    var t = []; for(var c=1;c<=MAX_CORES;c++) t.push('<option value="' + c + '"' + (c===MAX_CORES?' selected':'') + '>' + c + (c===MAX_CORES ? ' (all cores)' : '') + '</option>');
    el.threads.innerHTML = t.join('');
  }
  function describe(){
    var n = Number(el.puzzle.value), it = D.item(n), r = D.rangeHex(n);
    var size = BigInt(D.keyspaceSize(n));
    el.target.textContent = it.address; el.target.href = 'https://mempool.space/address/' + it.address;
    el.range.textContent = '0x' + r.start + ' → 0x' + r.end;
    el.space.textContent = fmtBig(size) + ' keys (2^' + (n-1) + ')';
    var st = it.state === 'open' ? '<span class="state state-open">OPEN</span> ' + it.balance + ' BTC on the line' + (it.publicKey ? ' · public key exposed, kangaroo would need ~2^' + Math.ceil((n+1)/2) + ' ops' : '')
           : it.state === 'solved' ? '<span class="state state-solved">SOLVED</span> swept ' + it.solveDate + ' · holds nothing, good for proving the engine'
           : '<span class="state state-preused">PRE-USED</span> not a true puzzle lot';
    el.lotstate.innerHTML = st;
    var rate = expectedRate();
    var full = Number(size) / rate, half = full / 2;
    el.eta.textContent = 'At ' + fmt(Math.round(rate)) + ' keys/s on ' + threadsSelected() + ' thread' + (threadsSelected()>1?'s':'') + ': expected ' + dur(half) + ', worst case ' + dur(full) + (bench ? (bench.threads === threadsSelected() ? ' (benchmarked)' : ' (scaled from a ' + bench.threads + '-thread benchmark)') : ' (estimate; run the benchmark)');
    el.custom.placeholder = r.start;
    el.customWrap.hidden = el.mode.value !== 'custom';
    [].slice.call(el.quick.querySelectorAll('button')).forEach(function(b){ b.classList.toggle('active', Number(b.dataset.lot) === n); });
    el.resume.hidden = !(resumeState && resumeState.n === n && resumeState.mode === el.mode.value && !running && !busy);
    try { localStorage.setItem('crk', JSON.stringify({ n:n, mode:el.mode.value, threads:threadsSelected() })); } catch(e){}
  }
  function totalChecked(){ return totals.reduce(function(a,b){ return a + b; }, 0n); }
  function elapsed(){ return pausedElapsed + (running ? (Date.now() - startedAt) / 1000 : 0); }
  function tick(){
    var t = totalChecked(), secs = elapsed();
    el.checked.textContent = t.toLocaleString('en-US');
    var rate = secs > 0 ? Number(t) / secs : 0;
    el.rate.textContent = rate ? fmt(Math.round(rate)) + ' keys/s' : '—';
    el.elapsed.textContent = dur(secs);
    if(current){
      var size = Number(BigInt(D.keyspaceSize(current.n)));
      var span = Number(current.hi - current.lo + 1n);
      // Random mode samples with replacement, so the chance the key has been hit is 1 - e^(-checked/size), never a sweep.
      var frac = current.mode === 'random' ? 1 - Math.exp(-Number(t) / size) : Number(t) / span;
      var pct = frac * 100;
      el.progress.style.width = Math.min(100, pct) + '%';
      el.progressbar.setAttribute('aria-valuenow', Math.min(100, pct).toFixed(2));
      el.pct.textContent = pct >= 0.01 ? pct.toFixed(2) + '%' : pct > 0 ? pct.toExponential(2) + '%' : '0%';
      el.pctlabel.textContent = current.mode === 'random' ? 'chance it was already hit' : 'of this sweep';
      el.remaining.textContent = current.mode === 'random' ? 'no sweep end · 50% odds after ' + (rate ? dur(size * Math.LN2 / rate) : '—') : rate ? dur(Math.max(0, span - Number(t)) / rate) : '—';
    }
  }
  function renderThreads(states){
    el.threadlist.innerHTML = states.map(function(s, i){
      return '<div class="thread"><b>T' + (i+1) + '</b><span class="mono">' + (s.current ? '0x' + s.current : '—') + '</span><em>' + (s.lanes !== undefined ? s.lanes + ' lanes' : '') + '</em></div>';
    }).join('');
  }
  function killWorkers(){ workers.forEach(function(w){ w.terminate(); }); workers = []; }
  function lockControls(on){
    el.puzzle.disabled = el.mode.disabled = el.custom.disabled = el.threads.disabled = on;
    el.quick.classList.toggle('disabled', on);
  }
  function setRunning(on){
    running = on;
    el.start.hidden = on; el.stop.hidden = !on; el.bench.disabled = on;
    lockControls(on);
    if(!on){ clearInterval(tickTimer); tick(); }
  }
  function setBusy(on){
    busy = on;
    el.start.disabled = on; el.bench.disabled = on; el.resume.disabled = on;
    lockControls(on);
  }

  function buildRun(){
    var n = Number(el.puzzle.value), it = D.item(n);
    var lo = 1n << BigInt(n-1), hi = (1n << BigInt(n)) - 1n;
    var mode = el.mode.value;
    if(mode === 'custom'){
      var raw = el.custom.value.trim().replace(/^0x/i, '');
      if(!/^[0-9a-f]+$/i.test(raw)){ setStatus('Enter a hex start key inside the range.', 'bad'); el.custom.focus(); return null; }
      var s = BigInt('0x' + raw);
      if(s < lo || s > hi){ setStatus('Start key 0x' + raw + ' is outside this lot’s range.', 'bad'); el.custom.focus(); return null; }
      lo = s; mode = 'sequential';
    }
    var cores = threadsSelected();
    var span = hi - lo + 1n;
    if(span < BigInt(cores) * 256n) cores = 1;
    return { n:n, item:it, lo:lo, hi:hi, mode:mode, cores:cores, chunk:span / BigInt(cores), uiMode:el.mode.value };
  }
  function launch(run, resumeMaps){
    var target;
    try { target = C.addressToHash160(run.item.address); } catch(err){ setStatus('Could not decode address: ' + err.message, 'bad'); return; }
    current = run; totals = []; killWorkers();
    var states = [], stopped = 0, exhausted = 0, stopMaps = [];
    for(var i=0;i<run.cores;i++) states.push({});
    renderThreads(states);
    el.workers.textContent = run.cores + (run.cores === 1 ? ' thread' : ' threads');
    startedAt = Date.now();
    setRunning(true);
    setStatus((resumeMaps ? 'Resumed' : 'Running') + ' · ' + (run.mode === 'random' ? 'random sampling' : 'sequential sweep') + ' on ' + run.cores + ' thread' + (run.cores>1?'s':'') + '.', 'run');
    for(i=0;i<run.cores;i++){
      (function(idx){
        var w = new Worker('js/cracker-worker.js');
        var wStart = run.lo + BigInt(idx) * run.chunk;
        var wEnd = idx === run.cores-1 ? run.hi : wStart + run.chunk - 1n;
        totals[idx] = 0n;
        w.onmessage = function(e){
          var m = e.data;
          if(m.type === 'progress'){ totals[idx] = BigInt(m.checked); states[idx] = { current:m.current, lanes:m.lanes }; if(idx === 0) renderThreads(states); }
          else if(m.type === 'found'){
            totals[idx] = BigInt(m.checked); resumeState = null; el.resume.hidden = true;
            pausedElapsed = elapsed(); killWorkers(); setRunning(false);
            setStatus('Private key found. Details below.', 'found');
            log('<b>Hit on lot #' + run.n + '</b> by thread ' + (idx+1) + ' after ' + fmtBig(totalChecked()) + ' keys', 'hit');
            showResult(m, run);
          }
          else if(m.type === 'exhausted'){
            totals[idx] = BigInt(m.checked);
            if(++exhausted >= run.cores){ pausedElapsed = elapsed(); killWorkers(); setRunning(false); resumeState = null; el.resume.hidden = true;
              setStatus('Range exhausted with no match.' + (run.uiMode === 'custom' ? ' The key is below your start point, or the address is not in this lot.' : ' Every key in the sweep was tested.'), 'bad');
              log('Sweep of lot #' + run.n + ' exhausted after ' + fmtBig(totalChecked()) + ' keys'); }
          }
          else if(m.type === 'stopped'){
            totals[idx] = BigInt(m.checked); stopMaps[idx] = m.resume;
            if(++stopped >= run.cores){ pausedElapsed = elapsed(); killWorkers(); setRunning(false);
              resumeState = run.mode === 'sequential' ? { n:run.n, mode:run.uiMode, run:run, maps:stopMaps, checked:totalChecked(), elapsed:pausedElapsed } : null;
              el.resume.hidden = !resumeState;
              setStatus('Stopped after ' + fmtBig(totalChecked()) + ' keys.' + (resumeState ? ' You can resume from exactly where each thread was.' : ''), 'idle');
              log('Stopped lot #' + run.n + ' at ' + fmtBig(totalChecked()) + ' keys'); }
          }
        };
        w.onerror = function(err){ killWorkers(); setRunning(false); setStatus('Worker error: ' + err.message, 'bad'); log('Worker error: ' + esc(err.message), 'hit'); };
        w.postMessage({ type:'start', target:target.buffer.slice(target.byteOffset, target.byteOffset + 20), start:wStart.toString(), end:wEnd.toString(), mode:run.mode, resumeKeys: resumeMaps ? resumeMaps[idx] : null });
        workers.push(w);
      }(i));
    }
    clearInterval(tickTimer); tickTimer = setInterval(tick, 300);
  }
  function start(){
    if(running || busy) return;
    var run = buildRun(); if(!run) return;
    el.result.hidden = true; pausedElapsed = 0; resumeState = null; el.resume.hidden = true;
    log('Started lot #' + run.n + ' · ' + (run.mode === 'random' ? 'random' : 'sequential from 0x' + run.lo.toString(16)) + ' · ' + run.cores + ' thread' + (run.cores>1?'s':''));
    launch(run, null);
  }
  function resume(){
    if(running || busy || !resumeState) return;
    var run = resumeState.run; pausedElapsed = resumeState.elapsed;
    var maps = resumeState.maps; var prior = resumeState.checked;
    log('Resumed lot #' + run.n + ' from saved thread positions');
    launch(run, maps);
    // carry the earlier count forward so totals keep climbing
    var carry = prior; totals.push(carry);
  }
  function stop(){ if(!running) return; setStatus('Stopping…', 'idle'); workers.forEach(function(w){ w.postMessage({ type:'stop' }); }); }
  function benchmark(){
    if(running || busy) return;
    setBusy(true); setStatus('Benchmarking ' + threadsSelected() + ' thread' + (threadsSelected()>1?'s':'') + ' for 3 seconds…', 'run');
    var n = threadsSelected(), done = 0, keys = 0, ws = [];
    for(var i=0;i<n;i++){
      var w = new Worker('js/cracker-worker.js');
      w.onmessage = function(e){ if(e.data.type !== 'bench') return; keys += e.data.keys / (e.data.ms/1000); if(++done === n){ ws.forEach(function(x){ x.terminate(); }); bench = { rate: Math.round(keys), threads: n }; setBusy(false); setStatus('Benchmark: ' + fmt(bench.rate) + ' keys/s across ' + n + ' thread' + (n>1?'s':'') + '. Estimates now use this figure.', 'idle'); log('Benchmark ' + fmt(bench.rate) + ' keys/s on ' + n + ' thread' + (n>1?'s':'')); describe(); } };
      w.postMessage({ type:'bench', ms:3000 }); ws.push(w);
    }
  }
  function copyBtn(text, label){ return '<button type="button" class="copy" data-copy="' + esc(text) + '" aria-label="Copy ' + esc(label) + '">copy</button>'; }
  function showResult(msg, run){
    var k = BigInt('0x' + msg.key), it = run.item;
    // Independent re-derivation on the main thread, separate from the worker that reported the hit.
    var reAddr = C.privToAddress(k), ok = reAddr === it.address && msg.address === it.address;
    var hex = C.hex64(k), wif = C.privToWIF(k);
    el.result.hidden = false;
    el.resultBody.innerHTML =
      '<div class="found-banner">' + (ok ? 'PRIVATE KEY FOUND · LOT #' + run.n : 'REPORTED KEY FAILED VERIFICATION') + '</div>' +
      '<dl class="modal-facts result-facts">' +
      '<dt>Private key (hex)</dt><dd class="mono"><code>' + hex + '</code>' + copyBtn(hex, 'private key hex') + '</dd>' +
      '<dt>Private key (decimal)</dt><dd class="mono">' + k.toString() + copyBtn(k.toString(), 'private key decimal') + '</dd>' +
      '<dt>WIF (compressed)</dt><dd class="mono"><code>' + wif + '</code>' + copyBtn(wif, 'WIF') + '</dd>' +
      '<dt>Target address</dt><dd class="mono"><a class="source-link" href="https://mempool.space/address/' + esc(it.address) + '" target="_blank" rel="noopener">' + esc(it.address) + ' ↗</a></dd>' +
      '<dt>Re-derived here</dt><dd class="mono">' + esc(reAddr) + ' ' + (ok ? '<span class="state state-open">VERIFIED MATCH</span>' : '<span class="state state-retired">MISMATCH</span>') + '</dd>' +
      '<dt>Keys checked</dt><dd class="mono">' + fmtBig(totalChecked()) + ' across ' + run.cores + ' thread' + (run.cores>1?'s':'') + ' in ' + dur(elapsed()) + '</dd>' +
      '</dl>' +
      '<p class="modal-foot">' + (it.state === 'open'
        ? 'This lot is unsolved and holds ' + it.balance + ' BTC. Import the WIF into a wallet you control and sweep immediately. Anyone else who finds this key can take the funds, and solved puzzle spends have been front-run in the mempool before: broadcast through a private relay with a high fee.'
        : 'This lot was already solved on ' + it.solveDate + ' and holds no balance. The key is real and was re-derived on the main thread independently of the worker, which is how you can tell the engine does genuine work.') + '</p>';
    el.result.scrollIntoView({ behavior:'smooth', block:'nearest' });
  }
  function onCopy(e){
    var b = e.target.closest('.copy'); if(!b) return;
    var text = b.dataset.copy;
    function done(){ b.textContent = 'copied'; setTimeout(function(){ b.textContent = 'copy'; }, 1500); }
    if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function(){ window.prompt('Copy:', text); });
    else window.prompt('Copy:', text);
  }
  function applyPreset(){
    var m = location.hash.match(/^#crack-(\d+)$/);
    if(m && Number(m[1]) >= 1 && Number(m[1]) <= 160){ el.puzzle.value = m[1]; describe(); return true; }
    return false;
  }
  document.addEventListener('DOMContentLoaded', function(){
    ['puzzle','mode','custom','customWrap','threads','quick','start','stop','resume','bench','status','target','lotstate','range','space','eta','checked','rate','elapsed','remaining','workers','pct','pctlabel','progress','progressbar','threadlist','result','resultBody','log'].forEach(function(k){ el[k] = $('crk-' + k); });
    if(!el.puzzle) return;
    if(typeof Worker === 'undefined' || typeof BigInt === 'undefined'){ setStatus('This browser lacks Web Workers or BigInt; the cracker cannot run here.', 'bad'); el.start.disabled = true; el.bench.disabled = true; return; }
    fillSelects();
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem('crk') || 'null'); if(saved){ if(saved.n) el.puzzle.value = saved.n; if(saved.mode) el.mode.value = saved.mode; if(saved.threads) el.threads.value = Math.min(saved.threads, MAX_CORES); } } catch(e){}
    if(!saved || !saved.n) el.puzzle.value = '20';
    if(!applyPreset()) describe();
    el.puzzle.addEventListener('change', describe);
    el.mode.addEventListener('change', describe);
    el.threads.addEventListener('change', describe);
    el.quick.addEventListener('click', function(e){ var b = e.target.closest('button[data-lot]'); if(!b || running) return; el.puzzle.value = b.dataset.lot; describe(); });
    el.custom.addEventListener('keydown', function(e){ if(e.key === 'Enter'){ e.preventDefault(); start(); } });
    el.start.addEventListener('click', start);
    el.stop.addEventListener('click', stop);
    el.resume.addEventListener('click', resume);
    el.bench.addEventListener('click', benchmark);
    el.resultBody.addEventListener('click', onCopy);
    window.addEventListener('hashchange', applyPreset);
    window.addEventListener('pagehide', killWorkers);
    log('Engine ready · ' + MAX_CORES + ' logical core' + (MAX_CORES>1?'s':'') + ' detected');
  });
  window.Cracker = { start:start, stop:stop, resume:resume };
}());

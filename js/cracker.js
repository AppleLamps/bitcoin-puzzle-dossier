// Web cracker controller: puzzle picker, thread pool, benchmark, pause/resume, live stats, verified result.
(function(){
  var D = window.PuzzleData, C = window.PuzzleCrypto;
  var el = {}, workers = [], running = false, startedAt = 0, pausedElapsed = 0, totals = [], tickTimer = null;
  var current = null;          // {n, item, lo, hi, mode, cores, chunk}
  var resumeState = null;      // per-worker resume maps after a stop
  var bench = null;            // {rate, threads}: measured keys/s and the thread count it was measured on
  var busy = false;            // true while a benchmark is running
  var benchWorkers = [];       // benchmark pool, so teardown can terminate it too
  var MAX_CORES = Math.max(1, Math.min(32, navigator.hardwareConcurrency || 2));
  var PER_CORE_GUESS = 180000; // limb-field engine; the benchmark measures the real figure

  function $(id){ return document.getElementById(id); }
  function fmt(n){ return Number(n).toLocaleString('en-US'); }
  function fmtBig(b){ return BigInt(b).toLocaleString('en-US'); }
  function fmtCompact(b){ var n = Number(b); return n < 1e6 ? n.toLocaleString('en-US') : new Intl.NumberFormat('en-US', { notation:'compact', maximumFractionDigits:2 }).format(n); }
  function esc(s){ return String(s).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function dur(secs){
    if(!isFinite(secs)) return '—';
    if(secs < 1) return 'under a second';
    if(secs < 60) return Math.round(secs) + ' s';
    if(secs < 3600) return Math.floor(secs/60) + ' min ' + Math.round(secs%60) + ' s';
    if(secs < 86400) return (secs/3600).toFixed(1) + ' h';
    if(secs < 3.15e7) return (secs/86400).toFixed(1) + ' days';
    var years = secs / 3.15e7;
    // Compact notation stops at trillions, so beyond that fall back to exponential.
    return (years < 1e15 ? fmtCompact(Math.round(years)) : years.toExponential(2)) + ' years';
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
      '<optgroup label="Open puzzles, address only (brute force)">' + open.join('') + '</optgroup>' +
      '<optgroup label="Open puzzles, public key exposed (kangaroo territory)">' + pub.join('') + '</optgroup>';
    var t = []; for(var c=1;c<=MAX_CORES;c++) t.push('<option value="' + c + '"' + (c===MAX_CORES?' selected':'') + '>' + c + (c===MAX_CORES ? ' (all cores)' : '') + '</option>');
    el.threads.innerHTML = t.join('');
  }
  function describe(){
    var n = Number(el.puzzle.value), it = D.item(n), sr = D.scanRange(n);
    if(resumeState && (resumeState.n !== n || resumeState.mode !== el.mode.value ||
       resumeState.threads !== threadsSelected() || resumeState.custom !== el.custom.value)){
      resumeState = null;
    }
    var r = { start: sr.lo.toString(16), end: sr.hi.toString(16) };
    var size = sr.size;
    el.target.textContent = it.address; el.target.href = 'https://mempool.space/address/' + it.address;
    el.range.textContent = '0x' + r.start + ' → 0x' + r.end;
    el.space.textContent = fmtBig(size) + ' keys' + (log2Exact(size) !== null ? ' (2^' + log2Exact(size) + ')' : '') +
      (sr.custom ? ' · restricted scan window; ' + (Number(size) / Number(D.keyspaceSize(n)) * 100).toFixed(4) + '% of the full puzzle range' : '');
    var st = it.state === 'open' ? '<span class="state state-open">OPEN</span> ' + it.balance + ' BTC on the line' + (it.publicKey ? ' · public key exposed, kangaroo would need ~2^' + Math.floor(n/2) + ' ops' : '')
           : it.state === 'solved' ? '<span class="state state-solved">SOLVED</span> swept ' + it.solveDate + ' · holds nothing, good for proving the engine'
           : '<span class="state state-preused">PRE-USED</span> not a true puzzle';
    el.lotstate.innerHTML = st;
    var rate = expectedRate();
    var full = Number(size) / rate, half = full / 2;
    var lead = 'At ' + fmt(Math.round(rate)) + ' keys/s on ' + threadsSelected() + ' thread' + (threadsSelected()>1?'s':'') + ': ';
    el.eta.textContent = lead + (el.mode.value === 'random'
      ? '50% odds after ' + dur(full * Math.LN2) + ', one keyspace of samples in ' + dur(full) + '; random sampling never guarantees completion'
      : 'expected ' + dur(half) + ', worst case ' + dur(full)) + (sr.custom ? '; assumes the key lies inside this restricted window' : '') + (bench ? (bench.threads === threadsSelected() ? ' (benchmarked)' : ' (scaled from a ' + bench.threads + '-thread benchmark)') : ' (estimate; run the benchmark)');
    el.custom.placeholder = r.start;
    el.customWrap.hidden = el.mode.value !== 'custom';
    [].slice.call(el.quick.querySelectorAll('button')).forEach(function(b){ b.classList.toggle('active', Number(b.dataset.lot) === n); });
    el.resume.hidden = !(resumeState && resumeState.n === n && resumeState.mode === el.mode.value && !running && !busy);
    try { localStorage.setItem('crk', JSON.stringify({ n:n, mode:el.mode.value, threads:threadsSelected() })); } catch(e){}
  }
  function log2Exact(v){
    // Returns k when v === 2^k, otherwise null.
    if(v <= 0n || (v & (v - 1n)) !== 0n) return null;
    return v.toString(2).length - 1;
  }
  function totalChecked(){ return totals.reduce(function(a,b){ return a + b; }, 0n); }
  function elapsed(){ return pausedElapsed + (running ? (Date.now() - startedAt) / 1000 : 0); }
  function tick(){
    var t = totalChecked(), secs = elapsed();
    el.checked.textContent = fmtCompact(t);
    el.checkedLabel.textContent = Number(t) >= 1e6 ? 'keys checked · exactly ' + t.toLocaleString('en-US') : 'keys checked';
    var rate = secs > 0 ? Number(t) / secs : 0;
    el.rate.textContent = rate ? fmtCompact(Math.round(rate)) : '—';
    el.rateLabel.textContent = rate ? 'keys per second · ' + fmt(Math.round(rate)) : 'keys per second';
    el.elapsed.textContent = dur(secs);
    if(current){
      var size = Number(D.scanRange(current.n).size);
      var span = Number(current.hi - current.lo + 1n);
      // Random mode samples with replacement, so the chance the key has been hit is 1 - e^(-checked/size), never a sweep.
      var frac = current.mode === 'random' ? 1 - Math.exp(-Number(t) / size) : Number(t) / span;
      var pct = frac * 100;
      el.progress.style.width = Math.min(100, pct) + '%';
      el.progressbar.setAttribute('aria-valuenow', Math.min(100, pct).toFixed(2));
      el.pct.textContent = pct >= 0.01 ? pct.toFixed(2) + '%' : pct > 0 ? pct.toExponential(2) + '%' : '0%';
      el.pctlabel.textContent = current.mode === 'random' ? 'chance it was already hit' : 'of this sweep';
      var isRandom = current.mode === 'random';
      el.remaining.textContent = isRandom ? (rate ? dur(size * Math.LN2 / rate) : '—') : rate ? dur(Math.max(0, span - Number(t)) / rate) : '—';
      el.remaining.classList.toggle('wrap', el.remaining.textContent.length > 12);
      el.remainingLabel.textContent = isRandom ? 'to 50% odds · no sweep end' : 'time to finish sweep';
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
    [].slice.call(el.quick.querySelectorAll('button')).forEach(function(b){ b.disabled = on; });
  }
  function setRunning(on){
    running = on;
    el.start.hidden = on; el.stop.hidden = !on; el.bench.disabled = on;
    if(on) el.resume.hidden = true;
    lockControls(on);
    if(!on){ clearInterval(tickTimer); tick(); }
  }
  function setBusy(on){
    busy = on;
    el.start.disabled = on; el.bench.disabled = on; el.resume.disabled = on;
    lockControls(on);
    describe();
  }

  function buildRun(){
    var n = Number(el.puzzle.value), it = D.item(n);
    var sr = D.scanRange(n), lo = sr.lo, hi = sr.hi;
    var mode = el.mode.value;
    if(mode === 'custom'){
      var raw = el.custom.value.trim().replace(/^0x/i, '');
      if(!/^[0-9a-f]+$/i.test(raw)){ setStatus('Enter a hex start key inside the range.', 'bad'); el.custom.focus(); return null; }
      var s = BigInt('0x' + raw);
      if(s < lo || s > hi){ setStatus('Start key 0x' + raw + ' is outside this puzzle’s range.', 'bad'); el.custom.focus(); return null; }
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
    var states = [], terminal = 0, exhaustedCount = 0, stopMaps = [], stopping = false;
    function finalize(){
      pausedElapsed = elapsed(); killWorkers(); setRunning(false);
      if(stopping && exhaustedCount < run.cores){
        resumeState = run.mode === 'sequential' ? { n:run.n, mode:run.uiMode, threads:threadsSelected(), custom:el.custom.value, run:run, maps:stopMaps, checked:totalChecked(), elapsed:pausedElapsed } : null;
        el.resume.hidden = !resumeState;
        setStatus('Stopped after ' + fmtBig(totalChecked()) + ' keys.' + (resumeState ? ' You can resume from exactly where each thread was.' : ''), 'idle');
        log('Stopped puzzle #' + run.n + ' at ' + fmtBig(totalChecked()) + ' keys');
      } else {
        resumeState = null; el.resume.hidden = true;
        setStatus('Range exhausted with no match.' + (D.scanRange(run.n).custom || run.uiMode === 'custom' ? ' Every key in the selected window was tested; the key may lie elsewhere in the full puzzle range.' : ' Every key in the sweep was tested.'), 'bad');
        log('Sweep of puzzle #' + run.n + ' exhausted after ' + fmtBig(totalChecked()) + ' keys');
      }
    }
    current.markStopping = function(){ stopping = true; };
    for(var i=0;i<run.cores;i++) states.push({});
    renderThreads(states);
    el.workers.textContent = String(run.cores);
    startedAt = Date.now();
    setRunning(true);
    setStatus((resumeMaps ? 'Resumed' : 'Running') + ' · ' + (run.mode === 'random' ? 'random sampling' : 'sequential sweep') + ' on ' + run.cores + ' thread' + (run.cores>1?'s':'') + '.', 'run');
    for(i=0;i<run.cores;i++){
      (function(idx){
        var w;
        try { w = new Worker('/js/cracker-worker.js'); }
        catch(err){ fail(err); return; }
        var wStart = run.lo + BigInt(idx) * run.chunk;
        var wEnd = idx === run.cores-1 ? run.hi : wStart + run.chunk - 1n;
        totals[idx] = 0n;
        w.onmessage = function(e){
          var m = e.data;
          if(m.type === 'progress'){ totals[idx] = BigInt(m.checked); states[idx] = { current:m.current, lanes:m.lanes }; renderThreads(states); }
          else if(m.type === 'found'){
            totals[idx] = BigInt(m.checked); resumeState = null; el.resume.hidden = true;
            pausedElapsed = elapsed(); killWorkers(); setRunning(false);
            if(showResult(m, run)){
              setStatus('Private key found. Details below.', 'found');
              log('<b>Hit on puzzle #' + run.n + '</b> by thread ' + (idx+1) + ' after ' + fmtBig(totalChecked()) + ' keys', 'hit');
            }
          }
          else if(m.type === 'exhausted' || m.type === 'stopped'){
            // Both are terminal for this worker. An exhausted worker contributes an empty resume map so the others can still resume.
            totals[idx] = BigInt(m.checked);
            states[idx] = { current:null, lanes:0 }; renderThreads(states);
            if(m.type === 'exhausted'){ exhaustedCount++; stopMaps[idx] = {}; } else { stopMaps[idx] = m.resume || {}; }
            if(++terminal >= run.cores) finalize();
          }
        };
        w.onerror = fail;
        workers.push(w);
        try { w.postMessage({ type:'start', target:target.buffer.slice(target.byteOffset, target.byteOffset + 20), start:wStart.toString(), end:wEnd.toString(), mode:run.mode, resumeKeys: resumeMaps ? resumeMaps[idx] : null }); }
        catch(err){ fail(err); }
      }(i));
      if(!running) break;
    }
    if(running){ clearInterval(tickTimer); tickTimer = setInterval(tick, 300); }
    function fail(err){
      pausedElapsed = elapsed(); killWorkers(); resumeState = null; el.resume.hidden = true; setRunning(false);
      setStatus('Worker error: ' + err.message, 'bad'); log('Worker error: ' + esc(err.message), 'hit');
    }
  }
  function start(){
    if(running || busy) return;
    var run = buildRun(); if(!run) return;
    el.result.hidden = true; pausedElapsed = 0; resumeState = null; el.resume.hidden = true;
    log('Started puzzle #' + run.n + ' · ' + (run.mode === 'random' ? 'random' : 'sequential from 0x' + run.lo.toString(16)) + ' · ' + run.cores + ' thread' + (run.cores>1?'s':''));
    launch(run, null);
  }
  function resume(){
    if(running || busy || !resumeState) return;
    var run = resumeState.run; pausedElapsed = resumeState.elapsed;
    var maps = resumeState.maps; var prior = resumeState.checked;
    log('Resumed puzzle #' + run.n + ' from saved thread positions');
    launch(run, maps);
    // carry the earlier count forward so totals keep climbing
    var carry = prior; totals.push(carry);
  }
  function stop(){ if(!running) return; setStatus('Stopping…', 'idle'); if(current && current.markStopping) current.markStopping(); workers.forEach(function(w){ w.postMessage({ type:'stop' }); }); }
  function benchmark(){
    if(running || busy) return;
    setBusy(true); setStatus('Benchmarking ' + threadsSelected() + ' thread' + (threadsSelected()>1?'s':'') + ' for 3 seconds…', 'run');
    var n = threadsSelected(), done = 0, keys = 0, ws = [];
    benchWorkers = ws;
    for(var i=0;i<n;i++){
      var w;
      try { w = new Worker('/js/cracker-worker.js'); }
      catch(err){ fail(err); break; }
      w.onerror = fail;
      w.onmessage = function(e){ if(e.data.type !== 'bench') return; keys += e.data.keys / (e.data.ms/1000); if(++done === n){ ws.forEach(function(x){ x.terminate(); }); benchWorkers = []; bench = { rate: Math.round(keys), threads: n }; setBusy(false); setStatus('Benchmark: ' + fmt(bench.rate) + ' keys/s across ' + n + ' thread' + (n>1?'s':'') + '. Estimates now use this figure.', 'idle'); log('Benchmark ' + fmt(bench.rate) + ' keys/s on ' + n + ' thread' + (n>1?'s':'')); describe(); } };
      ws.push(w);
      try { w.postMessage({ type:'bench', ms:3000 }); }
      catch(err){ fail(err); break; }
    }
    function fail(err){ ws.forEach(function(x){ x.terminate(); }); benchWorkers = []; setBusy(false); setStatus('Benchmark worker error: ' + err.message, 'bad'); }
  }
  function copyBtn(text, label){ return '<button type="button" class="copy" data-copy="' + esc(text) + '" aria-label="Copy ' + esc(label) + '">copy</button>'; }
  function showResult(msg, run){
    var k, reAddr = null, it = run.item;
    // Independent re-derivation on the main thread, separate from the worker that reported the hit.
    try { k = BigInt('0x' + msg.key); if(k >= run.lo && k <= run.hi) reAddr = C.privToAddress(k); } catch(e){}
    var ok = reAddr === it.address && msg.address === it.address;
    if(!ok){
      setStatus('Reported key failed independent verification.', 'bad');
      log('Rejected an unverified worker result for puzzle #' + run.n, 'hit');
      el.result.hidden = true;
      return false;
    }
    var hex = C.hex64(k), wif = C.privToWIF(k);
    el.result.hidden = false;
    el.resultBody.innerHTML =
      '<div class="found-banner">' + (ok ? 'PRIVATE KEY FOUND · PUZZLE #' + run.n : 'REPORTED KEY FAILED VERIFICATION') + '</div>' +
      '<dl class="modal-facts result-facts">' +
      '<dt>Private key (hex)</dt><dd class="mono"><code>' + hex + '</code>' + copyBtn(hex, 'private key hex') + '</dd>' +
      '<dt>Private key (decimal)</dt><dd class="mono">' + k.toString() + copyBtn(k.toString(), 'private key decimal') + '</dd>' +
      '<dt>WIF (compressed)</dt><dd class="mono"><code>' + wif + '</code>' + copyBtn(wif, 'WIF') + '</dd>' +
      '<dt>Target address</dt><dd class="mono"><a class="source-link" href="https://mempool.space/address/' + esc(it.address) + '" target="_blank" rel="noopener">' + esc(it.address) + ' ↗</a></dd>' +
      '<dt>Re-derived here</dt><dd class="mono">' + esc(reAddr) + ' ' + (ok ? '<span class="state state-open">VERIFIED MATCH</span>' : '<span class="state state-retired">MISMATCH</span>') + '</dd>' +
      '<dt>Keys checked</dt><dd class="mono">' + fmtBig(totalChecked()) + ' across ' + run.cores + ' thread' + (run.cores>1?'s':'') + ' in ' + dur(elapsed()) + '</dd>' +
      '</dl>' +
      '<p class="modal-foot">' + (it.state === 'open'
        ? 'This puzzle is unsolved and holds ' + it.balance + ' BTC. Import the WIF into a wallet you control and sweep immediately. Anyone else who finds this key can take the funds, and solved puzzle spends have been front-run in the mempool before: broadcast through a private relay with a high fee.'
        : (it.state === 'preused' ? 'This address was already in use before the puzzle was funded and holds no puzzle prize. ' : 'This puzzle was already solved on ' + it.solveDate + ' and holds no balance. ') + 'The key is real and was re-derived on the main thread independently of the worker, which is how you can tell the engine does genuine work.') + '</p>';
    el.result.scrollIntoView({ behavior:'smooth', block:'nearest' });
    return true;
  }
  function onCopy(e){
    var b = e.target.closest('.copy'); if(!b) return;
    var text = b.dataset.copy;
    function done(){ b.textContent = 'copied'; setTimeout(function(){ b.textContent = 'copy'; }, 1500); }
    if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function(){ window.prompt('Copy:', text); });
    else window.prompt('Copy:', text);
  }
  function teardown(){
    // Terminate every pool and reset state so a page restored from the back/forward cache can start again.
    killWorkers();
    benchWorkers.forEach(function(w){ w.terminate(); }); benchWorkers = [];
    if(running){ pausedElapsed = elapsed(); setRunning(false); setStatus('Run ended when the page was hidden.', 'idle'); }
    if(busy) setBusy(false);
    resumeState = null; el.resume.hidden = true;
  }
  function applyPreset(){
    if(running || busy) return false; // never retarget mid-run; the quick picks ignore clicks the same way
    var m = location.hash.match(/^#crack-(\d+)$/);
    if(m && Number(m[1]) >= 1 && Number(m[1]) <= 160){ el.puzzle.value = m[1]; describe(); return true; }
    return false;
  }
  document.addEventListener('DOMContentLoaded', function(){
    ['puzzle','mode','custom','customWrap','threads','quick','start','stop','resume','bench','status','target','lotstate','range','space','eta','checked','checkedLabel','rate','rateLabel','elapsed','remaining','remainingLabel','workers','pct','pctlabel','progress','progressbar','threadlist','result','resultBody','log'].forEach(function(k){ el[k] = $('crk-' + k); });
    if(!el.puzzle) return;
    el.status.setAttribute('role', 'status');
    el.progressbar.setAttribute('aria-label', 'Puzzle scan progress');
    if(typeof Worker === 'undefined' || typeof BigInt === 'undefined'){ setStatus('This browser lacks Web Workers or BigInt; the cracker cannot run here.', 'bad'); el.start.disabled = true; el.bench.disabled = true; return; }
    fillSelects();
    var saved = null;
    el.puzzle.value = '20';
    try {
      saved = JSON.parse(localStorage.getItem('crk') || 'null');
      if(saved){
        if(Number.isInteger(saved.n) && saved.n >= 1 && saved.n <= 160) el.puzzle.value = String(saved.n);
        if(['sequential','random','custom'].indexOf(saved.mode) !== -1) el.mode.value = saved.mode;
        if(Number.isInteger(saved.threads) && saved.threads >= 1) el.threads.value = String(Math.min(saved.threads, MAX_CORES));
      }
    } catch(e){}
    if(!applyPreset()) describe();
    el.puzzle.addEventListener('change', describe);
    el.mode.addEventListener('change', describe);
    el.threads.addEventListener('change', describe);
    el.custom.addEventListener('input', describe);
    el.quick.addEventListener('click', function(e){ var b = e.target.closest('button[data-lot]'); if(!b || running || busy) return; el.puzzle.value = b.dataset.lot; describe(); });
    el.custom.addEventListener('keydown', function(e){ if(e.key === 'Enter'){ e.preventDefault(); start(); } });
    el.start.addEventListener('click', start);
    el.stop.addEventListener('click', stop);
    el.resume.addEventListener('click', resume);
    el.bench.addEventListener('click', benchmark);
    el.resultBody.addEventListener('click', onCopy);
    window.addEventListener('hashchange', applyPreset);
    window.addEventListener('pagehide', teardown);
    log('Engine ready · ' + MAX_CORES + ' logical core' + (MAX_CORES>1?'s':'') + ' detected');
  });
  window.Cracker = { start:start, stop:stop, resume:resume };
}());

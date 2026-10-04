// Landing page: solve statistics, prize pool in USD, odds table.
(function(){
  var D = window.PuzzleData, P = window.BtcPrice;
  function fmt(n){ return Number(n).toLocaleString('en-US'); }
  function stats(){
    var solved = 0, open = 0, latest = null;
    for(var n=1;n<=160;n++){ var st = D.puzzleState(n); if(st === 'solved') solved++; if(st === 'open') open++; }
    // latest solve by date
    var best = null;
    for(n=1;n<=160;n++){ if(D.puzzleState(n) !== 'solved') continue; var d = Date.parse(D.solveDate(n)); if(!best || d > best.d){ best = { n:n, d:d, s:D.solveDate(n) }; } }
    document.getElementById('statSolved').textContent = solved;
    document.getElementById('statOpen').textContent = open;
    document.getElementById('statOpenInline').textContent = open;
    document.getElementById('statLatest').textContent = '#' + best.n;
    document.getElementById('statLatestNote').textContent = 'most recent solve, swept ' + best.s;
    var next = null; for(n=1;n<=160;n++){ if(D.puzzleState(n) === 'open'){ next = n; break; } }
    document.getElementById('statNext').textContent = '#' + next;
    document.getElementById('statNextNote').textContent = 'cheapest unsolved lot · ' + D.balanceFor(next) + ' BTC · 2^' + (next-1) + ' keys';
  }
  function bounty(){
    var usd = document.getElementById('bountyUsd'), btc = document.getElementById('bountyBtc'), note = document.getElementById('bountyNote');
    var total = D.totalOpenBtc();
    btc.textContent = total.toFixed(8) + ' BTC';
    P.get().then(function(p){
      var value = total * p.usd;
      usd.textContent = P.formatUsd(value);
      note.textContent = 'At ' + P.formatUsd(p.usd) + '/BTC via ' + p.source + ', ' + p.at.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) + '. Balances from the ' + D.BALANCE_SNAPSHOT + ' chain snapshot.';
    }).catch(function(){
      usd.textContent = total.toFixed(2) + ' BTC';
      note.textContent = 'Live USD price unavailable; balances from the ' + D.BALANCE_SNAPSHOT + ' chain snapshot.';
    });
  }
  function odds(){
    var rows = [71,72,73,74,76,80,90,100,110,120,140,160].filter(function(n){ return D.puzzleState(n) === 'open'; });
    var rate = 1e9; // one billion key tests (brute force) or group operations (kangaroo) per second
    function duration(secs){ return secs < 86400 ? (secs/3600).toFixed(1) + ' hours' : secs < 3.15e7 ? (secs/86400).toFixed(0) + ' days' : secs < 3.15e10 ? fmt(Math.round(secs/3.15e7)) + ' years' : (secs/3.15e7).toExponential(1) + ' years'; }
    var html = '<div class="odds-row odds-head"><div>LOT</div><div>EXPECTED WORK</div><div>AT 1 B ops/s</div><div>PRIZE</div><div>METHOD</div></div>';
    rows.forEach(function(n){
      var pk = D.hasPublicKey(n);
      // Brute force: half the interval on average, 2^(n-2) key tests.
      // Kangaroo on a known public key: about 2*sqrt(2^(n-1)) group operations, i.e. 2^((n+1)/2).
      var exp = pk ? (n + 1) / 2 : n - 2;
      var expected = Math.pow(2, exp);
      var expLabel = pk ? '2^' + exp.toFixed(1).replace(/\.0$/, '') : '2^' + exp;
      html += '<div class="odds-row" data-lot="' + n + '" role="button" tabindex="0" aria-label="Open details for lot ' + n + '"><div class="ledger-num">#' + n + '</div><div class="mono">' + expLabel + ' ≈ ' + expected.toExponential(2) + (pk ? ' ops' : ' keys') + '</div><div>' + duration(expected / rate) + '</div><div class="mono">' + D.balanceFor(n) + ' BTC</div><div>' + (pk ? 'Kangaroo · public key known' : 'Brute force · address only') + '</div></div>';
    });
    var el = document.getElementById('oddsTable');
    el.innerHTML = html;
    function activate(e){
      var r = e.target.closest('.odds-row[data-lot]'); if(!r) return;
      if(e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault(); window.PuzzleModal.open(Number(r.dataset.lot));
    }
    el.addEventListener('click', activate);
    el.addEventListener('keydown', activate);
  }
  document.addEventListener('DOMContentLoaded', function(){
    if(!document.getElementById('home')) return;
    stats(); bounty(); odds();
  });
}());

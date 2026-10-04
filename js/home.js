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
    var gpu = 1e9;
    var html = '<div class="odds-row odds-head"><div>LOT</div><div>EXPECTED TESTS</div><div>AT 1 B keys/s</div><div>PRIZE</div><div>METHOD</div></div>';
    rows.forEach(function(n){
      var expected = Math.pow(2, n-2);
      var secs = expected / gpu;
      var t = secs < 86400 ? (secs/3600).toFixed(1) + ' hours' : secs < 3.15e7 ? (secs/86400).toFixed(0) + ' days' : secs < 3.15e10 ? fmt(Math.round(secs/3.15e7)) + ' years' : (secs/3.15e7).toExponential(1) + ' years';
      var pk = D.hasPublicKey(n);
      html += '<div class="odds-row" data-lot="' + n + '"><div class="ledger-num">#' + n + '</div><div class="mono">2^' + (n-2) + ' ≈ ' + expected.toExponential(2) + '</div><div>' + t + '</div><div class="mono">' + D.balanceFor(n) + ' BTC</div><div>' + (pk ? 'Kangaroo · ~2^' + Math.ceil(n/2) + ' ops' : 'Brute force') + '</div></div>';
    });
    var el = document.getElementById('oddsTable');
    el.innerHTML = html;
    el.addEventListener('click', function(e){ var r = e.target.closest('.odds-row[data-lot]'); if(r) window.PuzzleModal.open(Number(r.dataset.lot)); });
  }
  document.addEventListener('DOMContentLoaded', function(){
    if(!document.getElementById('home')) return;
    stats(); bounty(); odds();
  });
}());

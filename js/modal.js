// Puzzle detail modal. PuzzleModal.open(n) renders everything known about lot n.
(function(){
  var modal, body, card, lastFocus;
  function esc(s){ return String(s).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function stateText(it){
    if(it.state === 'preused') return 'Lots #1 and #2 were already in use before the puzzle was funded, so their emptying is not counted as a solve.';
    if(it.state === 'retired') return 'The creator swept this lot on 11 July 2017 and moved the funds into the lower lots. There is nothing left to win here.';
    if(it.state === 'solved') return 'Solved and swept on ' + it.solveDate + '.' + (it.publicKey ? ' Its public key had been exposed in 2019, which made it reachable with Pollard’s kangaroo.' : '');
    return it.publicKey
      ? 'Still open. The creator exposed this lot’s public key in 2019, so it can be attacked with Pollard’s kangaroo (about 2^' + Math.ceil(it.n/2) + ' operations) instead of address-only brute force.'
      : 'Still open. Only the address is known, so a solver must brute-force the private-key interval and hash every candidate.';
  }
  function usdLine(it){
    if(it.state !== 'open' || !window.BtcPrice) return '';
    var id = 'modalUsd' + it.n;
    window.BtcPrice.get().then(function(p){
      var el = document.getElementById(id);
      if(el) el.textContent = window.BtcPrice.formatUsd(Number(it.balance) * p.usd) + ' at ' + window.BtcPrice.formatUsd(p.usd) + '/BTC (' + p.source + ')';
    }).catch(function(){
      var el = document.getElementById(id);
      if(el) el.textContent = 'live price unavailable';
    });
    return '<dt>USD value</dt><dd id="' + id + '">fetching…</dd>';
  }
  function render(it){
    var D = window.PuzzleData, r = D.rangeHex(it.n);
    var bits = it.n;
    var size = D.keyspaceSize(it.n);
    return '' +
      '<div class="modal-kicker">LOT #' + it.n + ' · <span class="state state-' + it.state + '">' + D.labels[it.state] + '</span>' + (it.publicKey ? ' <span class="state state-public">PUBLIC KEY EXPOSED</span>' : '') + '</div>' +
      '<h2 id="modalTitle" class="modal-title">' + bits + '-bit puzzle</h2>' +
      '<p class="modal-lede">' + esc(stateText(it)) + '</p>' +
      '<dl class="modal-facts">' +
        '<dt>Address</dt><dd class="mono"><a class="source-link" href="https://mempool.space/address/' + esc(it.address) + '" target="_blank" rel="noopener">' + esc(it.address) + ' ↗</a></dd>' +
        '<dt>Balance</dt><dd class="mono">' + esc(it.balance) + ' BTC' + (it.state === 'open' ? ' <small>(chain re-read ' + D.BALANCE_SNAPSHOT + ')</small>' : '') + '</dd>' +
        usdLine(it) +
        '<dt>Original prize</dt><dd class="mono">' + esc(it.original) + ' BTC on 15 Jan 2015</dd>' +
        '<dt>Key range (hex)</dt><dd class="mono">' + r.start + '<br>→ ' + r.end + '</dd>' +
        '<dt>Key range (math)</dt><dd class="mono">[2^' + (bits-1) + ', 2^' + bits + ')</dd>' +
        '<dt>Keys to search</dt><dd class="mono">' + BigInt(size).toLocaleString('en-US') + ' <small>(2^' + (bits-1) + ')</small></dd>' +
        '<dt>Record</dt><dd>' + esc(it.record) + '</dd>' +
        (it.solveDate && it.state === 'solved' ? '<dt>Solved</dt><dd>' + esc(it.solveDate) + '</dd>' : '') +
      '</dl>' +
      '<p class="modal-foot">Address type: compressed-key P2PKH. Status and balances are from the August 2026 snapshot, not live chain data.</p>';
  }
  function open(n){
    var it = window.PuzzleData.item(n);
    if(!it.address) return;
    lastFocus = document.activeElement;
    body.innerHTML = render(it);
    modal.hidden = false;
    document.body.classList.add('modal-open');
    card.focus();
  }
  function close(){
    if(modal.hidden) return;
    modal.hidden = true;
    document.body.classList.remove('modal-open');
    if(lastFocus && lastFocus.focus) lastFocus.focus();
  }
  document.addEventListener('DOMContentLoaded', function(){
    modal = document.getElementById('puzzleModal');
    body = document.getElementById('modalBody');
    card = modal.querySelector('.modal-card');
    modal.addEventListener('click', function(e){ if(e.target.closest('[data-modal-close]')) close(); });
    document.addEventListener('keydown', function(e){ if(e.key === 'Escape') close(); });
  });
  window.PuzzleModal = { open:open, close:close };
}());

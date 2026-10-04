// Ledger table: filtering, collapsed retired puzzles, click-to-open detail rows.
(function(){
  var D = window.PuzzleData;
  var rows, search, filter, count, empty, toggleWrap, toggleBtn;
  var showRetired = false, rendered = false;

  function allItems(){
    return (window.puzzleAddresses || []).map(function(_, i){ return D.item(i + 1); });
  }
  function matches(item, raw, numeric, f){
    var textMatch = !raw || (numeric !== null ? item.n === numeric : item.address.toLowerCase().indexOf(raw) !== -1);
    var stateMatch = f === 'all' || item.state === f || (f === 'emptied' && (item.state === 'solved' || item.state === 'preused')) || (f === 'public' && item.publicKey);
    return textMatch && stateMatch;
  }
  function rowHtml(item){
    return '<article class="ledger-grid ledger-row" role="button" tabindex="0" data-lot="' + item.n + '" aria-label="Open details for puzzle ' + item.n + '">' +
      '<div class="ledger-num" data-label="PUZZLE">#' + item.n + '</div>' +
      '<div class="ledger-address" data-label="ADDRESS">' + item.address + '</div>' +
      '<div class="ledger-range" data-label="KEY RANGE · HEX">' + D.rangeFor(item.n) + '</div>' +
      '<div class="ledger-original" data-label="BALANCE*">' + item.balance + ' BTC<small>original ' + item.original + '</small></div>' +
      '<div data-label="STATUS"><span class="state state-' + item.state + '">' + D.labels[item.state] + '</span></div>' +
      '<div class="ledger-record" data-label="RECORD">' + item.record + '</div>' +
    '</article>';
  }
  function render(){
    var raw = search.value.trim().toLowerCase().replace(/^#/, '');
    var f = filter.value;
    var numeric = /^\d+$/.test(raw) ? Number(raw) : null;
    var matched = allItems().filter(function(it){ return matches(it, raw, numeric, f); });
    // Retired puzzles stay hidden unless the user opens them, searches for one directly, or filters to them.
    var reveal = showRetired || f === 'retired' || raw !== '';
    var hiddenRetired = reveal ? [] : matched.filter(function(it){ return it.state === 'retired'; });
    var visible = reveal ? matched : matched.filter(function(it){ return it.state !== 'retired'; });
    rows.innerHTML = visible.map(rowHtml).join('');
    toggleWrap.hidden = hiddenRetired.length === 0;
    toggleBtn.textContent = 'Show the remaining ' + hiddenRetired.length + ' retired puzzles (#' + D.RETIRED_FROM + '–256)';
    count.textContent = visible.length + (visible.length === 1 ? ' row' : ' rows') + (hiddenRetired.length ? ' · ' + hiddenRetired.length + ' retired hidden' : '');
    empty.hidden = visible.length !== 0 || hiddenRetired.length !== 0;
    rendered = true;
  }
  function onRowActivate(e){
    var row = e.target.closest('.ledger-row');
    if(!row) return;
    if(e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    window.PuzzleModal.open(Number(row.dataset.lot));
  }
  document.addEventListener('DOMContentLoaded', function(){
    rows = document.getElementById('ledgerRows');
    search = document.getElementById('ledgerSearch');
    filter = document.getElementById('ledgerFilter');
    count = document.getElementById('ledgerCount');
    empty = document.getElementById('ledgerEmpty');
    toggleWrap = document.getElementById('retiredToggle');
    toggleBtn = document.getElementById('retiredButton');
    search.addEventListener('input', render);
    filter.addEventListener('change', render);
    toggleBtn.addEventListener('click', function(){ showRetired = true; toggleBtn.setAttribute('aria-expanded', 'true'); render(); });
    rows.addEventListener('click', onRowActivate);
    rows.addEventListener('keydown', onRowActivate);
  });
  window.Ledger = { render: render, isRendered: function(){ return rendered; } };
}());

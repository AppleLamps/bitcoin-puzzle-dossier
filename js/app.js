// Page wiring: section rail highlighting, case-file / ledger tab switching, landing bounty tile.
(function(){
  function initRail(){
    var links = [].slice.call(document.querySelectorAll('.rail a'));
    var sections = links.map(function(a){ return document.querySelector(a.getAttribute('href')); }).filter(Boolean);
    function mark(){
      var y = window.scrollY + 120, current = sections[0];
      sections.forEach(function(s){ if(s.offsetTop <= y) current = s; });
      links.forEach(function(a){ a.classList.toggle('active', a.getAttribute('href') === '#' + current.id); });
    }
    window.addEventListener('scroll', mark, {passive:true}); mark();
  }
  function syncPage(){
    var showLedger = location.hash === '#ledger';
    document.getElementById('dossier').hidden = showLedger;
    document.getElementById('ledger').hidden = !showLedger;
    [].slice.call(document.querySelectorAll('[data-page-link]')).forEach(function(link){
      var active = link.dataset.pageLink === (showLedger ? 'ledger' : 'dossier');
      link.classList.toggle('active', active);
      if(active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
    });
    if(showLedger && !window.Ledger.isRendered()) window.Ledger.render();
  }
  function initBounty(){
    var D = window.PuzzleData, P = window.BtcPrice;
    var usd = document.getElementById('bountyUsd'), btc = document.getElementById('bountyBtc'), note = document.getElementById('bountyNote');
    var total = D.totalOpenBtc();
    btc.textContent = total.toFixed(8) + ' BTC';
    P.get().then(function(p){
      var value = total * p.usd;
      usd.textContent = P.formatCompact(value);
      usd.title = P.formatUsd(value);
      note.textContent = 'Unsolved bounty · ' + P.formatUsd(value) + ' at ' + P.formatUsd(p.usd) + '/BTC via ' + p.source + ', ' + p.at.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
    }).catch(function(){
      usd.textContent = total.toFixed(2) + ' BTC';
      note.textContent = 'Live USD price unavailable; showing BTC total from the ' + D.BALANCE_SNAPSHOT + ' chain snapshot.';
    });
  }
  document.addEventListener('DOMContentLoaded', function(){
    initRail();
    initBounty();
    window.addEventListener('hashchange', syncPage);
    syncPage();
  });
}());

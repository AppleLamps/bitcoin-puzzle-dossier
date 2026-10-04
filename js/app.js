// Page wiring: section rail highlighting, case-file / ledger tab switching, landing bounty tile.
(function(){
  var railHandler = null;
  function initRail(){
    if(railHandler){ window.removeEventListener('scroll', railHandler); railHandler = null; }
    var links = [].slice.call(document.querySelectorAll('.page-view:not([hidden]) .rail a'));
    var sections = links.map(function(a){ return document.querySelector(a.getAttribute('href')); }).filter(Boolean);
    if(!links.length || !sections.length) return; // pages without a section rail (the ledger) have nothing to track
    function mark(){
      var y = window.scrollY + 120, current = sections[0];
      sections.forEach(function(s){ if(s.offsetTop <= y) current = s; });
      links.forEach(function(a){ a.classList.toggle('active', a.getAttribute('href') === '#' + current.id); });
    }
    railHandler = mark;
    window.addEventListener('scroll', mark, {passive:true}); mark();
  }
  var pages = ['home','dossier','ledger'];
  var sectionOwner = {};
  function pageFor(hash){
    var id = (hash || '').replace(/^#/, '');
    if(pages.indexOf(id) !== -1) return id;
    if(/^crack-\d+$/.test(id)) return 'home';
    return sectionOwner[id] || 'home';
  }
  function syncPage(){
    var page = pageFor(location.hash);
    pages.forEach(function(id){ document.getElementById(id).hidden = id !== page; });
    [].slice.call(document.querySelectorAll('[data-page-link]')).forEach(function(link){
      var active = link.dataset.pageLink === page;
      link.classList.toggle('active', active);
      if(active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
    });
    if(page === 'ledger' && !window.Ledger.isRendered()) window.Ledger.render();
    var target = location.hash && location.hash.length > 1 ? document.getElementById(location.hash.slice(1)) : null;
    if(target && pages.indexOf(target.id) === -1) target.scrollIntoView();
    initRail();
  }
  document.addEventListener('DOMContentLoaded', function(){
    pages.forEach(function(p){ [].slice.call(document.querySelectorAll('#' + p + ' .section')).forEach(function(s){ sectionOwner[s.id] = p; }); });
    window.addEventListener('hashchange', syncPage);
    syncPage();
  });
}());

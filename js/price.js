// Live BTC/USD price with two independent public sources and a graceful fallback.
(function(){
  var sources = [
    { name:'CoinGecko', url:'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd', pick:function(j){ return j.bitcoin && j.bitcoin.usd; } },
    { name:'mempool.space', url:'https://mempool.space/api/v1/prices', pick:function(j){ return j.USD; } }
  ];
  function fetchJson(url){
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctrl && setTimeout(function(){ ctrl.abort(); }, 6000);
    return fetch(url, ctrl ? {signal:ctrl.signal} : undefined).then(function(r){
      if(!r.ok) throw new Error(r.status);
      return r.json();
    }).finally(function(){ if(timer) clearTimeout(timer); });
  }
  function getPrice(){
    var i = 0;
    function next(){
      if(i >= sources.length) return Promise.reject(new Error('no price source reachable'));
      var s = sources[i++];
      return fetchJson(s.url).then(function(j){
        var p = Number(s.pick(j));
        if(!isFinite(p) || p <= 0) throw new Error('bad payload');
        return { usd:p, source:s.name, at:new Date() };
      }).catch(next);
    }
    return next();
  }
  var cached = null;
  window.BtcPrice = {
    get: function(){ if(!cached) cached = getPrice().catch(function(e){ cached = null; throw e; }); return cached; },
    formatUsd: function(v, opts){
      opts = opts || {};
      return new Intl.NumberFormat('en-US', { style:'currency', currency:'USD', maximumFractionDigits: opts.cents ? 2 : 0 }).format(v);
    },
    formatCompact: function(v){
      return new Intl.NumberFormat('en-US', { style:'currency', currency:'USD', notation:'compact', maximumFractionDigits:1 }).format(v);
    }
  };
}());

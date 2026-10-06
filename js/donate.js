// Copy-to-clipboard for the BTC tip address in the header.
(function(){
  document.addEventListener('DOMContentLoaded', function(){
    var btn = document.getElementById('donateButton'), addr = document.getElementById('donateAddr'), note = document.getElementById('donateCopied');
    if(!btn) return;
    function flash(msg){ note.textContent = msg; clearTimeout(flash.t); flash.t = setTimeout(function(){ note.textContent = ''; }, 1800); }
    btn.addEventListener('click', function(){
      var text = addr.textContent.trim();
      if(navigator.clipboard && navigator.clipboard.writeText){
        navigator.clipboard.writeText(text).then(function(){ flash('COPIED'); }, function(){ fallback(text); });
      } else fallback(text);
    });
    function fallback(text){
      var ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly',''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      var copied = false;
      try { copied = document.execCommand('copy'); } catch(e){}
      document.body.removeChild(ta);
      if(copied) flash('COPIED'); else window.prompt('Copy BTC donation address:', text);
    }
  });
}());

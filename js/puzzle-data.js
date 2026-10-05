// Static puzzle facts: solve dates, open balances, state helpers.
// Everything is exposed on window.PuzzleData so the other modules can share it.
(function(){
  var laterSolveDates = {
    51:'05 Apr 2017',52:'21 Apr 2017',53:'04 Sep 2017',54:'16 Nov 2017',55:'29 May 2018',56:'08 Sep 2018',57:'08 Nov 2018',58:'03 Dec 2018',59:'11 Feb 2019',60:'17 Feb 2019',61:'11 May 2019',62:'08 Sep 2022',63:'12 Jul 2019',64:'09 Sep 2022',65:'07 Jun 2019',66:'12 Sep 2024',67:'21 Feb 2025',68:'06 Apr 2025',69:'30 Apr 2025',70:'09 Jun 2019',75:'10 Jun 2019',80:'11 Jun 2019',85:'17 Jun 2019',90:'01 Jul 2019',95:'06 Jul 2019',100:'08 Jul 2019',105:'23 Sep 2019',110:'30 May 2020',115:'16 Jun 2020',120:'27 Feb 2023',125:'09 Jul 2023',130:'23 Sep 2024',135:'28 Jul 2026'
  };
  var openBalances = {
    71:'7.10182686',72:'7.20014379',73:'7.30013849',74:'7.40004977',76:'7.60000000',77:'7.70002426',78:'7.80000000',79:'7.90000000',81:'8.10001500',82:'8.20000000',83:'8.30002046',84:'8.40001500',86:'8.60000000',87:'8.70000000',88:'8.80000000',89:'8.90000000',91:'9.10000000',92:'9.20000000',93:'9.30000000',94:'9.40000000',96:'9.60000600',97:'9.70002613',98:'9.80000000',99:'9.91257338',101:'10.10000000',102:'10.20000000',103:'10.30000000',104:'10.40001600',106:'10.60000000',107:'10.70000000',108:'10.80000000',109:'10.90010500',111:'11.10010000',112:'11.20000000',113:'11.30000000',114:'11.40000000',116:'11.60001210',117:'11.70000000',118:'11.80000661',119:'11.90000000',121:'12.10000000',122:'12.20000000',123:'12.30000000',124:'12.40000000',126:'12.60000000',127:'12.70000000',128:'12.80000000',129:'12.90000000',131:'13.10000000',132:'13.20000000',133:'13.30000000',134:'13.40000000',136:'13.60000000',137:'13.70000000',138:'13.80000000',139:'13.90000000',140:'14.00001600',141:'14.10014846',142:'14.20000000',143:'14.30000000',144:'14.40000000',145:'14.50000600',146:'14.60000000',147:'14.70000000',148:'14.80000000',149:'14.90001000',150:'15.00001600',151:'15.10001000',152:'15.20001000',153:'15.30001000',154:'15.40001000',155:'15.50011600',156:'15.60001000',157:'15.70001000',158:'15.80001000',159:'15.90002600',160:'16.00119082'
  };
  var lateSolved = [75,80,85,90,95,100,105,110,115,120,125,130,135];
  var RETIRED_FROM = 161;
  var BALANCE_SNAPSHOT = '21 Aug 2026';

  function solveDate(n){
    if(n >= 3 && n <= 28) return '15 Jan 2015';
    if(n >= 29 && n <= 33) return '16 Jan 2015';
    if(n >= 34 && n <= 36) return '17 Jan 2015';
    if(n === 37) return '18 Jan 2015';
    if(n === 38) return '19 Jan 2015';
    if(n === 39) return '21 Jan 2015';
    if(n >= 40 && n <= 46) return '30 Jan 2015';
    if(n >= 47 && n <= 50) return '01 Sep 2015';
    return laterSolveDates[n] || '';
  }
  function puzzleState(n){
    if(n <= 2) return 'preused';
    if(n <= 70 || lateSolved.indexOf(n) !== -1) return 'solved';
    if(n < RETIRED_FROM) return 'open';
    return 'retired';
  }
  function hasPublicKey(n){ return n >= 65 && n <= 160 && n % 5 === 0; }
  function rangeHex(n){
    var start = 1n << BigInt(n - 1);
    var end = (1n << BigInt(n)) - 1n;
    return { start: start.toString(16), end: end.toString(16) };
  }
  function rangeFor(n){ var r = rangeHex(n); return r.start + ' — ' + r.end; }
  function keyspaceSize(n){ return (1n << BigInt(n - 1)).toString(); }
  // Scanner-only overrides. The ledger and puzzle pages keep the canonical [2^(N-1), 2^N) range;
  // the web scanner sweeps the narrower window listed here instead when one exists.
  var scanOverrides = {
    71: { start: '680000000000000000', end: '6bffffffffffffffff' }
  };
  function scanRange(n){
    var o = scanOverrides[n];
    var lo = o ? BigInt('0x' + o.start) : (1n << BigInt(n - 1));
    var hi = o ? BigInt('0x' + o.end) : ((1n << BigInt(n)) - 1n);
    return { lo: lo, hi: hi, size: hi - lo + 1n, custom: !!o };
  }
  function balanceFor(n){ return puzzleState(n) === 'open' ? openBalances[n] : '0.00000000'; }
  function originalFor(n){ return (n/1000).toFixed(3); }
  function recordFor(n,state){
    if(state === 'preused') return 'Known before puzzle · not a solve';
    if(state === 'solved') return 'Swept ' + solveDate(n) + (hasPublicKey(n) ? ' · public key exposed' : '');
    if(state === 'open') return hasPublicKey(n) ? 'Public key exposed · kangaroo' : 'Address only · brute force';
    return 'Creator sweep · 11 Jul 2017';
  }
  function totalOpenBtc(){
    // Sum in satoshis to avoid float drift.
    var sats = 0n;
    Object.keys(openBalances).forEach(function(k){ sats += BigInt(openBalances[k].replace('.','')); });
    return Number(sats) / 1e8;
  }
  function item(n){
    var address = (window.puzzleAddresses || [])[n-1];
    return { n:n, address:address, state:puzzleState(n), publicKey:hasPublicKey(n), balance:balanceFor(n), original:originalFor(n), solveDate:solveDate(n), record:recordFor(n,puzzleState(n)) };
  }

  window.PuzzleData = {
    RETIRED_FROM: RETIRED_FROM,
    BALANCE_SNAPSHOT: BALANCE_SNAPSHOT,
    openBalances: openBalances,
    openCount: Object.keys(openBalances).length,
    solveDate: solveDate,
    puzzleState: puzzleState,
    hasPublicKey: hasPublicKey,
    rangeHex: rangeHex,
    rangeFor: rangeFor,
    keyspaceSize: keyspaceSize,
    scanRange: scanRange,
    balanceFor: balanceFor,
    originalFor: originalFor,
    recordFor: recordFor,
    totalOpenBtc: totalOpenBtc,
    item: item,
    labels: {open:'OPEN',solved:'SOLVED',preused:'PRE-USED',retired:'RETIRED'}
  };
}());

// A seeded permutation schedules every block once without storing a shuffled list.
// Six balanced Feistel rounds use SHA-256; cycle walking handles any block count.
(function(root){
  // Benchmarks on the current limb-field engine put 2^18 keys near the best
  // balance between randomized coverage and scalar-multiplication setup cost.
  var DEFAULT_BLOCK_SIZE = 262144;
  function seedBytes(hex){
    if(!/^[0-9a-f]{64}$/i.test(hex)) throw new Error('Invalid random block seed');
    var bytes = new Uint8Array(32);
    for(var i=0;i<32;i++) bytes[i] = parseInt(hex.slice(i*2, i*2+2), 16);
    return bytes;
  }
  function freshSeed(){
    var bytes = new Uint8Array(32); root.crypto.getRandomValues(bytes);
    return Array.from(bytes, function(b){ return b.toString(16).padStart(2, '0'); }).join('');
  }
  function create(start, end, options){
    options = options || {};
    var span = end - start + 1n;
    if(start < 1n || span < 1n) throw new Error('Invalid block interval');
    var requested = options.blockSize || DEFAULT_BLOCK_SIZE;
    if(!Number.isSafeInteger(requested) || requested < 1) throw new Error('Invalid block size');
    // Small puzzles still get enough independent lanes to use batched inversion.
    var adaptive = span / 256n;
    var blockSize = options.state ? options.state.blockSize :
      (adaptive < BigInt(requested) ? Number(adaptive > 0n ? adaptive : 1n) : requested);
    if(!Number.isSafeInteger(blockSize) || blockSize < 1) throw new Error('Invalid saved block size');
    var width = BigInt(blockSize), count = (span + width - 1n) / width;
    var seed = options.state ? options.state.seed : (options.seed || freshSeed());
    var key = seedBytes(seed);
    var cursor = options.state ? BigInt(options.state.next) : 0n;
    if(cursor < 0n || cursor > count) throw new Error('Invalid saved block position');
    var bits = count === 1n ? 2 : (count - 1n).toString(2).length;
    if(bits % 2) bits++;
    var half = BigInt(bits / 2), mask = (1n << half) - 1n;
    var halfBytes = Math.ceil(bits / 16);
    var input = new Uint8Array(33 + halfBytes); input.set(key);
    function permute(value){
      var left = value >> half, right = value & mask;
      for(var round=0;round<6;round++){
        input[32] = round;
        var x = right;
        for(var j=input.length-1;j>=33;j--){ input[j] = Number(x & 255n); x >>= 8n; }
        var hash = root.PuzzleCrypto.sha256(input), f = 0n;
        for(j=0;j<halfBytes;j++) f = (f << 8n) | BigInt(hash[j]);
        var next = left ^ (f & mask); left = right; right = next;
      }
      return (left << half) | right;
    }
    function blockIndex(value){
      if(count === 1n) return 0n;
      do { value = permute(value); } while(value >= count);
      return value;
    }
    return {
      blockSize: blockSize,
      count: count,
      next: function(){
        if(cursor === count) return null;
        var index = blockIndex(cursor++), lo = start + index * width;
        var hi = lo + width - 1n;
        return { lo:lo, hi:hi < end ? hi : end };
      },
      snapshot: function(){ return { seed:seed, blockSize:blockSize, next:cursor.toString() }; }
    };
  }
  root.PuzzleRandomBlocks = { create:create, DEFAULT_BLOCK_SIZE:DEFAULT_BLOCK_SIZE };
}(typeof self !== 'undefined' ? self : globalThis));

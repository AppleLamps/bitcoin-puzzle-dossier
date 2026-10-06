// Benchmark randomized block sizes through the real worker scan loop.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

function run(blockSize, ms){
  return new Promise((resolve, reject) => {
    let timeout;
    const scope = {
      postMessage(message){ if(message.type === 'bench'){ clearTimeout(timeout); resolve(message); } },
      setTimeout, clearTimeout, Date, Math, JSON, console,
      Uint8Array, Uint32Array, Int32Array, BigInt, Array, Object, String, Number, Infinity, isFinite,
      crypto:crypto.webcrypto
    };
    scope.self = scope;
    vm.createContext(scope);
    scope.importScripts = file => {
      if(file === 'crypto.js') scope.PuzzleCrypto = require('../js/crypto.js').PuzzleCrypto;
      else vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', file), 'utf8'), scope);
    };
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/cracker-worker.js'), 'utf8'), scope);
    scope.onmessage({ data:{ type:'bench', mode:'random', blockSize, ms } });
    timeout = setTimeout(() => reject(new Error('benchmark timed out')), ms + 15000);
  });
}

(async () => {
  const ms = (Number(process.argv[2]) || 2) * 1000;
  const sizes = process.argv[3] ? process.argv[3].split(',').map(Number) : [4096, 16384, 65536, 262144];
  for(const size of sizes){
    const result = await run(size, ms);
    console.log(String(size).padStart(6) + ' keys/block: ' + Math.round(result.keys / (result.ms / 1000)).toLocaleString('en-US') + ' keys/s');
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

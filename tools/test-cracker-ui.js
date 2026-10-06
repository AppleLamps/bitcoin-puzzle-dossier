// Exercise controller state transitions without starting CPU-intensive workers.
// The real worker and cryptographic math are covered by the other test suites.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const C = require('../js/crypto.js').PuzzleCrypto;

class Element {
  constructor(){
    this.value = ''; this.textContent = ''; this.hidden = false; this.disabled = false;
    this.style = {}; this.children = []; this.listeners = {}; this.attributes = {};
    this.classList = { toggle(){} };
  }
  set innerHTML(html){
    this.html = html;
    this.options = Array.from(html.matchAll(/<option value="([^"]+)"([^>]*)>/g));
    if(this.options.length) this.value = (this.options.find(m => m[2].includes('selected')) || this.options[0])[1];
  }
  get innerHTML(){ return this.html || ''; }
  addEventListener(type, callback){ (this.listeners[type] ||= []).push(callback); }
  dispatch(type, event = {}){ for(const callback of this.listeners[type] || []) callback(event); }
  querySelectorAll(){ return this.children; }
  setAttribute(name, value){ this.attributes[name] = value; }
  insertBefore(child){ this.children.unshift(child); }
  removeChild(child){ this.children.splice(this.children.indexOf(child), 1); }
  get firstChild(){ return this.children[0]; }
  get lastChild(){ return this.children[this.children.length - 1]; }
  focus(){}
  scrollIntoView(){}
}

function controller(options = {}){
  const elements = {}, workers = [], intervals = new Set();
  const document = new Element(), window = new Element();
  document.getElementById = id => elements[id] ||= new Element();
  document.createElement = () => new Element();
  const get = name => document.getElementById('crk-' + name);
  get('mode').value = 'sequential';
  get('quick').children = [5, 20, 71].map(n => {
    const button = new Element(); button.dataset = { lot: String(n) }; return button;
  });
  get('resume').hidden = get('result').hidden = true;
  window.PuzzleCrypto = C;
  let attempts = 0;
  class Worker {
    constructor(){
      if(options.failConstructor === ++attempts) throw new Error('constructor blocked');
      this.messages = []; workers.push(this);
    }
    postMessage(message){ if(options.failPost) throw new Error('post failed'); this.messages.push(message); }
    terminate(){ this.terminated = true; }
    emit(message){ this.onmessage({ data: message }); }
  }
  const scope = {
    window, document, navigator: { hardwareConcurrency: 4 }, Worker,
    location: { hash: '' },
    localStorage: { getItem: () => options.saved || null, setItem(){} },
    setInterval: callback => { intervals.add(callback); return callback; },
    clearInterval: callback => intervals.delete(callback),
    setTimeout(){}, clearTimeout(){}, console
  };
  vm.createContext(scope);
  for(const file of ['addresses.js', 'puzzle-data.js', 'cracker.js']){
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', file), 'utf8'), scope);
  }
  document.dispatch('DOMContentLoaded');
  function change(name, value, type = 'change'){ get(name).value = value; get(name).dispatch(type); }
  function stop(){
    window.Cracker.stop();
    for(const worker of workers.filter(w => !w.terminated)) worker.emit({ type: 'stopped', checked: '10', resume: { 0: '8000a' } });
  }
  return { get, change, workers, window, intervals, stop };
}

{
  const ui = controller({ saved: JSON.stringify({ n: 999, mode: 'invalid', threads: -3 }) });
  assert.equal(ui.get('puzzle').value, '20');
  assert.equal(ui.get('mode').value, 'sequential');
  assert.equal(ui.get('threads').value, '4');
  assert.match(ui.get('target').textContent, /^1/);
  console.log('UI: invalid saved settings recover to working defaults');
}

for(const options of [{ failConstructor: 1 }, { failConstructor: 2 }, { failPost: true }]){
  const ui = controller(options);
  ui.window.Cracker.start();
  assert.equal(ui.get('start').hidden, false);
  assert.equal(ui.get('puzzle').disabled, false);
  assert.equal(ui.intervals.size, 0);
  assert.match(ui.get('status').textContent, /Worker error/);
  assert.ok(ui.workers.every(w => w.terminated));
  const benchmark = controller(options);
  benchmark.get('bench').dispatch('click');
  assert.equal(benchmark.get('start').disabled, false);
  assert.equal(benchmark.get('puzzle').disabled, false);
  assert.match(benchmark.get('status').textContent, /Benchmark worker error/);
  assert.ok(benchmark.workers.every(w => w.terminated));
}
console.log('UI: startup failures terminate partial pools and unlock run/benchmark controls');

{
  const ui = controller();
  ui.get('bench').dispatch('click');
  assert.ok(ui.get('quick').children.every(button => button.disabled));
  const button = ui.get('quick').children[0];
  ui.get('quick').dispatch('click', { target: { closest: () => button } });
  assert.equal(ui.get('puzzle').value, '20');
  ui.workers.forEach(worker => worker.emit({ type: 'bench', keys: 100, ms: 1000 }));
  assert.ok(ui.get('quick').children.every(button => !button.disabled));
  assert.equal(ui.get('start').disabled, false);
  console.log('UI: quick picks cannot retarget during a benchmark and unlock afterward');
}

for(const [name, value, event] of [['threads', '2', 'change'], ['custom', '80010', 'input']]){
  const ui = controller();
  ui.window.Cracker.start(); ui.stop();
  assert.equal(ui.get('resume').hidden, false);
  ui.change(name, value, event);
  assert.equal(ui.get('resume').hidden, true);
  const count = ui.workers.length;
  ui.window.Cracker.resume();
  assert.equal(ui.workers.length, count);
}
console.log('UI: editing the thread count or start key invalidates stale resume state');

{
  const ui = controller(); ui.window.Cracker.start(); ui.stop();
  ui.window.Cracker.resume();
  assert.equal(ui.get('resume').hidden, true);
  assert.equal(ui.get('stop').hidden, false);
  console.log('UI: resume is hidden while the resumed run is active');
}

{
  const ui = controller(); ui.window.Cracker.start(); ui.stop();
  ui.get('bench').dispatch('click');
  assert.equal(ui.get('resume').hidden, true);
  ui.workers.filter(worker => !worker.terminated).forEach(worker => worker.emit({ type: 'bench', keys: 100, ms: 1000 }));
  assert.equal(ui.get('resume').hidden, false);
  console.log('UI: benchmarking temporarily hides and then restores a saved resume');
}

for(const key of ['2', 'not-hex']){
  const ui = controller(); ui.change('puzzle', '1'); ui.window.Cracker.start();
  ui.workers[0].emit({ type: 'found', key, checked: '1', address: C.privToAddress(1n) });
  assert.match(ui.get('status').textContent, /failed independent verification/);
  assert.equal(ui.get('result').hidden, true);
}
{
  const ui = controller(); ui.change('puzzle', '1'); ui.window.Cracker.start();
  ui.workers[0].emit({ type: 'found', key: '1', checked: '1', address: C.privToAddress(1n) });
  assert.match(ui.get('status').textContent, /Private key found/);
  assert.equal(ui.get('result').hidden, false);
  assert.match(ui.get('resultBody').innerHTML, /VERIFIED MATCH/);
  assert.match(ui.get('resultBody').innerHTML, /already in use before/);
}
console.log('UI: only independently verified keys inside the run interval are displayed');

{
  const ui = controller(); ui.change('puzzle', '71');
  assert.match(ui.get('space').textContent, /restricted scan window/);
  assert.match(ui.get('eta').textContent, /assumes the key lies inside/);
}
console.log('UI: restricted windows disclose their coverage and conditional estimates');
console.log('UI: ALL CHECKS PASSED');

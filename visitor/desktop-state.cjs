'use strict';
// Prevent accidental adoption of real HEAT state and concurrent desktop writers.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const C = require('./authority-contract.cjs');
function acquire(directory, role, worldId) {
  const marker = path.join(directory, 'desktop-state.json'), lock = path.join(directory, 'desktop-owner.lock');
  const expected = { version: 1, role, world_id: worldId };
  if (fs.existsSync(marker)) C.assert(C.canonical(JSON.parse(fs.readFileSync(marker))) === C.canonical(expected), 'Prepared state belongs to another role/world.');
  else {
    C.assert(!['accounts.json', 'degrees.json', 'trophies.json', 'authority-world.json'].some(name => fs.existsSync(path.join(directory, name))), 'Existing account/award/world state needs a separately approved cutover. Select the isolated desktop state.');
    fs.mkdirSync(directory, { recursive: true }); fs.writeFileSync(marker, JSON.stringify(expected), { flag: 'wx' });
  }
  const value = JSON.stringify({ pid: process.pid, instance: crypto.randomBytes(16).toString('hex') });
  try { fs.writeFileSync(lock, value, { flag: 'wx' }); }
  catch (error) { if (error.code === 'EEXIST') throw new Error('Another service owns this state, or an interrupted service left a lock. Check the recorded owner before recovery.'); throw error; }
  let released = false;
  return () => { if (released) return; released = true; if (fs.existsSync(lock) && fs.readFileSync(lock, 'utf8') === value) fs.unlinkSync(lock); };
}
module.exports = { acquire };

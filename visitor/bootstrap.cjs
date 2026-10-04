'use strict';
const path = require('node:path');
const M = require('./model.cjs');
try {
  if (!process.argv[2]) throw new Error('Supply the local state directory.');
  console.log(M.identity(path.join(path.resolve(process.argv[2]), 'identity.json')).id);
} catch { console.error('Local HEAT profile needs recovery. Existing identity was retained.'); process.exitCode = 1; }

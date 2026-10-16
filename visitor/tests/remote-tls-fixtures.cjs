'use strict';
// Only temporary, isolated test certificates. Never import into an OS trust store.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { spki } = require('../authority-contract.cjs');
const candidates = process.env.HEAT_TEST_OPENSSL ? [process.env.HEAT_TEST_OPENSSL] : ['C:/Program Files/Git/usr/bin/openssl.exe', 'C:/Program Files/Git/mingw64/bin/openssl.exe'];
const executable = candidates.find(file => fs.existsSync(file));
const python = process.env.HEAT_TEST_PYTHON;
function createFixtures(directory) {
  if (!executable && !python) throw new Error('Set HEAT_TEST_OPENSSL or HEAT_TEST_PYTHON to an existing test runtime.');
  fs.mkdirSync(directory, { recursive: true });
  if(!executable)execFileSync(python,[path.join(__dirname,'remote-tls-fixtures.py'),directory],{stdio:'pipe',windowsHide:true,timeout:15000});
  if(executable){
  const run = args => execFileSync(executable, args, { cwd: directory, stdio: 'pipe', windowsHide: true, timeout: 15000 });
  run(['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-days', '1', '-subj', '/CN=Isolated HEAT test CA', '-keyout', 'ca.key', '-out', 'ca.pem']);
  for (const name of ['server', 'player', 'toast', 'rogue']) {
    run(['req', '-new', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-subj', '/CN=' + name, '-keyout', name + '.key', '-out', name + '.csr']);
    fs.writeFileSync(path.join(directory, name + '.ext'), ['server', 'player'].includes(name) ? 'subjectAltName=DNS:localhost,IP:127.0.0.1\nextendedKeyUsage=serverAuth\n' : 'extendedKeyUsage=clientAuth\n');
    run(['x509', '-req', '-in', name + '.csr', '-CA', 'ca.pem', '-CAkey', 'ca.key', '-CAcreateserial', '-days', '1', '-sha256', '-extfile', name + '.ext', '-out', name + '.pem']);
  }
  }
  const read = file => fs.readFileSync(path.join(directory, file));
  return { ca: read('ca.pem'), player: { cert: read('player.pem'), key: read('player.key') }, playerSpki: spki(read('player.pem')), server: { cert: read('server.pem'), key: read('server.key') },
    toast: { cert: read('toast.pem'), key: read('toast.key') }, rogue: { cert: read('rogue.pem'), key: read('rogue.key') },
    serverSpki: spki(read('server.pem')), toastSpki: spki(read('toast.pem')), directory };
}
module.exports = { createFixtures, available: Boolean(executable || python) };

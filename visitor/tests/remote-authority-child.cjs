'use strict';
const fs = require('node:fs');
const { createAuthorityHost } = require('../authority-host.cjs');
const config = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const host = createAuthorityHost({ gameRoot: config.gameRoot, stateDir: config.stateDir, worldId: config.worldId, toastSpki: config.toastSpki,
  tls: { ca: fs.readFileSync(config.ca), cert: fs.readFileSync(config.cert), key: fs.readFileSync(config.key) } });
host.server.listen(0, '127.0.0.1', () => process.send?.({ ready: true, port: host.server.address().port }));
process.on('message', message => { if (message === 'close') host.server.close(() => process.exit(0)); });
process.on('disconnect', () => host.server.close(() => process.exit(0)));

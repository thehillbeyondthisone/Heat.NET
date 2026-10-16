'use strict';
const path = require('node:path');
const { loadToastConfig, argumentsFor } = require('./deployment-config.cjs');
function main(argv = process.argv.slice(2)) {
  const args = argumentsFor(argv), config = loadToastConfig(args.file);
  if (args.check) { console.log(JSON.stringify({ valid: true, role: 'heat-identity-awards', bind: '127.0.0.1', port: config.port, world_id: config.remoteAuthority.world_id, listener_started: false })); return; }
  const { createVisitorServer } = require('./server.cjs');
  const { server } = createVisitorServer({ root: path.join(__dirname, '..'), ...config, allowedHosts: [] });
  server.on('error', error => { console.error('HEAT remote adapter could not start: ' + (error.code || 'configuration failure')); server.close(); process.exitCode = 1; });
  // Only this service link is remote. Browser admission and native client routes stay loopback.
  server.listen(config.port, '127.0.0.1', () => console.log('HEAT identity/awards preview at http://127.0.0.1:' + config.port + '/api/visitor/health'));
  for (const event of ['SIGINT', 'SIGTERM']) process.once(event, () => { server.close(() => process.exit(0)); });
  return server;
}
if (require.main === module) { try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; } }
module.exports = { main };

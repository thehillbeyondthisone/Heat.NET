'use strict';
const { loadHostConfig, argumentsFor } = require('./deployment-config.cjs');
const { createAuthorityHost } = require('./authority-host.cjs');
function main(argv = process.argv.slice(2)) {
  const args = argumentsFor(argv, true), config = loadHostConfig(args.file, args.allowNetworkBind);
  if (args.check) { console.log(JSON.stringify({ valid: true, role: 'gameplay-authority', bind: config.bind, port: config.port, world_id: config.worldId, listener_started: false })); return; }
  const host = createAuthorityHost(config);
  host.server.on('error', error => { console.error('Gameplay authority could not start: ' + (error.code || 'configuration failure')); host.server.close(); process.exitCode = 1; });
  host.server.listen(config.port, config.bind, () => console.log('Authenticated gameplay authority listening on ' + config.bind + ':' + config.port));
  for (const event of ['SIGINT', 'SIGTERM']) process.once(event, () => { host.close().then(() => process.exit(0)); });
  return host;
}
if (require.main === module) { try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; } }
module.exports = { main };

'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { loadHostConfig, loadToastConfig, argumentsFor } = require('../deployment-config.cjs');
const { createFixtures, available } = require('./remote-tls-fixtures.cjs');
test('deployment entry points validate explicit trust without listeners, workers or state; network binding is opt-in', { skip: !available }, () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'heat-config-check-'));
  try {
    const fixture = createFixtures(path.join(temp, 'tls')), hostFile = path.join(temp, 'host.json'), remoteFile = path.join(temp, 'remote.json'), toastFile = path.join(temp, 'toast.json');
    const host = { bind: '127.0.0.1', port: 10662, world_id: 'isolated-config-world', game_root: path.join(temp, 'game'), state_dir: path.join(temp, 'host-state'), toast_spki: fixture.toastSpki,
      ca_file: path.join(fixture.directory, 'ca.pem'), cert_file: path.join(fixture.directory, 'server.pem'), key_file: path.join(fixture.directory, 'server.key') };
    const remote = { endpoint: 'https://127.0.0.1:10662', world_id: host.world_id, server_spki: fixture.serverSpki,
      ca_file: host.ca_file, cert_file: path.join(fixture.directory, 'toast.pem'), key_file: path.join(fixture.directory, 'toast.key') };
    const toast = { port: 10661, game_root: host.game_root, state_dir: path.join(temp, 'heat-state'), authority_config_file: remoteFile };
    const write = () => { fs.writeFileSync(hostFile, JSON.stringify(host)); fs.writeFileSync(remoteFile, JSON.stringify(remote)); fs.writeFileSync(toastFile, JSON.stringify(toast)); }; write();
    assert.equal(loadHostConfig(hostFile).bind, '127.0.0.1');
    host.bind = '192.0.2.123'; write(); assert.throws(() => loadHostConfig(hostFile), /network listener/); assert.equal(loadHostConfig(hostFile, true).bind, host.bind);
    host.bind = '127.0.0.1'; host.port = 10660; write(); assert.throws(() => loadHostConfig(hostFile), /10660/); host.port = 10662; write();
    toast.port = 10660; write(); assert.throws(() => loadToastConfig(toastFile), /10660/); toast.port = 10661; write();
    assert.throws(() => argumentsFor(['--config=' + toastFile, '--allow-network-bind']), /Use --config/);
    assert.throws(() => argumentsFor(['--config=' + toastFile, '--config=' + toastFile]), /Duplicate/);
    assert.throws(() => argumentsFor(['--config=relative.json']), /absolute/);
    let checked = 0;
    for (const [script, config, role] of [['start-authority.cjs', hostFile, 'gameplay-authority'], ['start-remote-heat.cjs', toastFile, 'heat-identity-awards']]) {
      // Extracted role packages check their own included entry point; the full source checks both.
      const scriptFile = path.join(__dirname, '..', script); if (!fs.existsSync(scriptFile)) continue; checked++;
      const result = JSON.parse(execFileSync(process.execPath, [scriptFile, '--config=' + config, '--check'], { encoding: 'utf8', timeout: 10000, windowsHide: true }));
      assert.equal(result.valid, true); assert.equal(result.role, role); assert.equal(result.listener_started, false); assert.equal(result.bind, '127.0.0.1');
    }
    assert.ok(checked > 0);
    assert.equal(fs.existsSync(host.state_dir), false); assert.equal(fs.existsSync(toast.state_dir), false); assert.equal(fs.existsSync(host.game_root), false);
  } finally {
    const safe = fs.realpathSync(temp); assert.ok(safe.startsWith(fs.realpathSync(os.tmpdir()) + path.sep)); fs.rmSync(safe, { recursive: true, force: true });
  }
});

# Secure gameplay host preparation

Prepared on Toast, 2026-10-09. This is an opt-in source checkpoint. No deployment configuration, persistent certificate/private key, network listener, firewall rule, service restart, Harbinger connection, external chat connection or upload was performed.

## Two roles, one identity and award owner

Toast runs the existing HEAT account, cookie, Degree and trophy systems. Browser admission and native client routes remain HTTP on **Toast loopback only**. The small native client still obtains its identity from a signed-in HEAT admission and sends game intents to that local broker. Two native clients on Toast can use different existing HEAT accounts and share the game hosted elsewhere. This checkpoint does not expose those account/native routes to other PCs.

The separate gameplay authority runs the unchanged 30 Hz Godot simulation and owns `authority-world.json`: world checkpoint, opaque HEAT profile/session bindings, ordered commands and cumulative server-observed participation. Its source package contains no accounts, passwords, cookies, Degree balance or trophy policy modules. Toast stores `multiplayer-remote.json`, a receipt/pending-input journal, and applies the existing award rules. Neither role copies the other's state database. Existing `multiplayer.json` remains the distinct loopback world; there is no automatic migration or merging.

The service link is HTTPS with TLS 1.3 only, a private explicitly supplied CA, mutual certificate verification, server hostname/IP SAN verification, and SHA-256 SPKI pins in both directions. The expected gameplay certificate is pinned by Toast; the expected Toast client certificate is pinned by the host. IP addresses and nicknames do not authenticate accounts. Session resumption is disabled on the proxy agent so its certificate pin is checked on every connection. No third-party connection, system trust-store installation or plaintext fallback is used. Node's built-in [TLS API](https://nodejs.org/api/tls.html) and [HTTPS API](https://nodejs.org/api/https.html) provide the transport; no npm dependencies are required.

## Application binding and retry

The only gameplay-host route is HTTPS `POST /v1/authority`. It accepts the strict `10six-authority-mtls-v1` envelope with a random request id, operation and payload. Responses echo the protocol/request id. Payloads bind the agreed world id, stable HEAT profile id, earning session id and admission generation. The certificate authorizes only Toast's broker to issue those bindings. Native clients cannot connect directly with a browser ticket.

Admission counters persist on both sides. A matching last admission is idempotent; replacing a connection advances its admission counter and generation. An older admission cannot reactivate an old generation. Each earning session has an ordered command sequence. An exact last-intent retry returns the saved result; a conflicting digest, older sequence, skipped sequence or wrong owner fails. TLS provides encrypted transport integrity; persisted application counters supply replay and restart protection. A response alone cannot substitute another profile/session/world's evidence.

Toast persists a pending intent before sending it. The authority persists its receipt and world checkpoint before replying. An uncertain network reply leaves that same pending intent for retry/reconnect reconciliation. A committed retry receipt remains valid even if a fresh world view is temporarily unavailable. Receipt counters cannot regress, and existing ledger transaction ids and trophy ids prevent duplicate awards. Do not discard a pending journal or independently restore one side's database to an earlier sequence; reconciliation will fail closed rather than fork ownership.

Game time comes from the host's monotonic clock and consecutive fresh server-frame acknowledgements no more than five seconds apart. Pause, disconnection, stale/forged frames and host downtime do not create elapsed credit. There is no client timestamp or client-proposed reward field. Toast retains the Chicago launch-date rules and the existing 100/day, 250/accumulated hour and attendance bonuses. Only the already approved First Claim and Two-Camp Pioneer trophies are evaluated from owned, completed, surviving NCs.

## Configuration source

Copy and fill the three `visitor/config/*.example.json` files only after the corresponding deployment approvals. Examples deliberately contain invalid placeholder pins and nonexistent credential paths. TLS files and state/game/config paths must be absolute. Each host retains its own private leaf key; the CA private key is not needed by either running service and must not be included in a source bundle.

| File | Owner and purpose |
| --- | --- |
| `gameplay-host.example.json` | Gameplay host: bind/port, world, game/state paths, approved CA/server certificate/key and Toast SPKI pin. Default bind is `127.0.0.1`. |
| `remote-authority.example.json` | Toast: HTTPS origin, same world, host SPKI pin and CA/Toast certificate/key paths. Default endpoint is loopback. |
| `toast-heat.example.json` | Toast: loopback port, game/state paths and remote authority config path. Default port is 10661; 10660 is refused. |

These explicit entry points are separate from the existing `server.js` and `tools/start-heat-net.ps1`. Existing launchers retain their local behavior. A configuration check reads supplied TLS files and validates key/certificate syntax without creating state, starting a worker, contacting another host or opening a listener:

```powershell
node visitor/start-authority.cjs --config=C:/APPROVED/config/gameplay-host.json --check
node visitor/start-remote-heat.cjs --config=C:/APPROVED/config/toast-heat.json --check
```

After separate start approval, remove `--check`. A gameplay bind outside loopback additionally requires `--allow-network-bind`; that flag is an operational guard, not a substitute for authorization. The HEAT entry point always binds `127.0.0.1`. Neither wrapper stops an existing process or restarts the service on 10660. Listener errors fail rather than take a port from another service. Start with new isolated state directories and two test accounts; do not use or copy real identities/balances for this first validation.

## Local validation and source packages

The full nested HEAT suite runs `npm run test:visitor`. All tests use temporary accounts/state and random loopback ports. Secure transport tests create temporary one-day certificate fixtures with an already trusted OpenSSL tool, never import them into OS trust, and remove them with their isolated test state. Tests exercise missing/wrong client certificates, wrong server pin, wrong server name, TLS downgrade, world mismatch, ordered/replayed inputs, uncertain reply recovery, reconnects, both-process restart, two actual native clients sharing construction/mining, unchanged real save/ledger hashes, and existing awards credited only on Toast.

Two source-only packages share the same protocol and common module hashes: a Toast HEAT/client package and a gameplay authority package. Each includes a per-file manifest and source/rules/runtime requirements. No runtime binary, credential, real account/ledger/save, archive, artwork, dependency cache or unrelated game asset is included. Windows runtime lookup remains `game/recovery/runtime/Godot.exe`; Linux service installation and executable-path adaptation have not been approved or implemented. The authority can run offline config/contract checks without Godot. The paired native test requires approved Node 22+, trusted Windows Godot 4.7.1, and the trusted local OpenSSL test tool; a skipped runtime test is not proof of multiplayer.

## Bounded real Toast–Harbinger validation approvals

1. Approve access to Harbinger and transfer of the **specific newly hashed** authority bundle, plus installation/copying of any required already verified runtime there. The earlier Library bundle predates this transport and is not an interchangeable deployment artifact. New bundles have not been uploaded.
2. Approve a private test CA and one server/client leaf key pair provisioned on their respective owners, certificate lifetime/rotation procedure, exact public-key pins and agreed world id. Approve credential file locations and access controls; no persistent credentials were generated in this work. Harbinger's certificate SAN must match the exact endpoint used by Toast. Do not bypass verification for an IP address or self-signed certificate.
3. Approve the exact Harbinger interface and port (proposed example `192.168.1.168:10662`) and, if required, a firewall rule restricted to Toast's agreed source address. No broad account portal exposure is required. Network reachability is not currently verified.
4. Approve Toast's explicit outbound HTTPS configuration and a separate loopback test service on 10661 with isolated HEAT state. The existing 10660 service remains running. Later production cutover, account/state use and controlled service restart require their own approval after isolated validation.

Then verify both archive/per-file manifests on the destination, run offline checks on each role, run `--check` with the approved configurations, start the approved isolated host and Toast proxy, and use two test identities through Toast to claim separate camps and observe both NCs/mining. Confirm only Toast stores account/award files; only the host stores authoritative checkpoints. Retry an identical input, reject a conflicting replay/wrong owner, pause/reconnect, stop/restart each owned test process, and confirm no duplicate or downtime awards. Verify wrong pin/certificate fails closed in isolated configuration. Retain redacted evidence, stop only those test processes, and request any production cutover separately.

Gameplay scope remains the shared Visitor test slice: eight camps, NC/well construction, movement, Jitter storage and mining, asset-free top-down presentation, transient 15-minute native tokens, no shared combat/trading or service-downtime simulation catch-up. No human control/visual approval is implied by headless tests. The optional future community-room adapter remains documented in `docs/GAME-ADAPTERS.md`; no external authentication or data-sharing integration is active.


The shared desktop shell and authenticated player-facing transport are documented in [DESKTOP-PLAYER-CONTROLS.md](DESKTOP-PLAYER-CONTROLS.md). Players use public trust only; Toast remains the single HEAT account/award owner. That document contains the unexecuted bounded v3 deployment proposal.

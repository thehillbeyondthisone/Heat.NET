# HEAT game adapter contract

The first implementation is `visitor/multiplayer.cjs` for 10Six. It restores shared gameplay locally without copying HEAT identity or economic systems. Its authority id is `10six-server-v1`; its logical world id is `visitor-loopback-v1`, scoped to one HEAT state directory. Independently started portals do not federate worlds.

## Admission

HEAT owns registration, passwords, browser sign-in and stable profile ids. An adapter receives an existing account's `profile_id`, display alias and the opaque active-account-session key. It never accepts a client-selected profile id or password. An authenticated, same-origin browser request creates a short-lived, single-use admission ticket. The native client exchanges that ticket for an in-memory token bound to the same HEAT account session. Logout, expiry and reconnect replacement revoke that client.

Current routes under `/api/visitor/multiplayer`:

| Route | Input and boundary |
| --- | --- |
| POST `/admission` | Empty JSON; signed-in HEAT cookie and same origin; returns a 30-second ticket. |
| POST `/launch` | Same admission boundary; launches the local native client. |
| POST `/connect` | `{ticket}`; consumes it once; returns token, stable profile, next sequence and authoritative world. |
| GET `/state` | Bearer token; returns latest world and next sequence; this read alone grants no gameplay time. |
| POST `/input` | Bearer token; `{seq,action}`; exact last-input retries are idempotent. |
| POST `/disconnect` | Bearer token; revokes this client. |

Every route is loopback only. The authority's private control listener also binds only `127.0.0.1`, selects a transient port and requires a random handshake nonce. That nonce lives only in this launch and is not an account or persistent secret.

## Gameplay and receipts

The game owns simulation, ownership validation, input legality, clocks and world checkpoints. 10Six uses one Godot worker running the unchanged `sim.gd` and `world.gd`; the shared registry maps HEAT profile ids to distinct camp simulations. The protocol-2 client inherits the existing original 3D First Plot renderer, HUD and cameras, projects owner inventory and supports NC/well construction, storage, hoverboard movement, jumping and door-based NC entry/exit. Peer camps are view-only. Cross-camp avatars, combat and trading remain future work. See the root docs/HEAT-SHARED-3D.md for activation gating and controls.

Allowed intents are `claim`, `build` (NC/well), `store`, `move`, `stop`, `jump`, `enter`, `exit`, and `sync` (new server-frame acknowledgement plus active/paused state). Unknown fields, arbitrary coordinates, invented awards and client report payloads fail validation. The backend serializes inputs. Each acknowledged command result, checkpoint and per-account participation counter commits in `multiplayer.json` before settlement. If the worker fails or a command checkpoint cannot commit, it is stopped; reconnect restores the last durable world before retry. No unconfirmed command is treated as accepted.

A server-only receipt delivered to HEAT has this shape:

```js
{
  authority: '10six-server-v1',
  profile_id, session_id, started_unix,
  active_seconds, generated_unix,
  camps // game-owned, authoritative facts for the two existing Visitor trophies
}
```

HEAT's callback opens/tag-checks the existing Degree session and calls `degrees.observeServer`. That function runs the same earning policy as local launches. It cannot be driven through report/import APIs. The callback adapts authoritative camp facts to `trophies.observe`; no client-proposed trophy ids are accepted. Persistent transaction ids and cumulative counters make retries/reconciliation safe across restarts and interrupted award writes.

For another game, implement its gameplay admission and server-observation adapter, then explicitly register its authority and supported award evidence in HEAT. Reuse the account-session broker and ledger policy; do not create another identity database or Degree balance. Quake II/Scud launch folders can be prepared independently, but launching a stock engine is not enough evidence for authoritative participation.

## Optional future community-room adapter

The community resurrection developer may later agree on a supported interface. A dedicated optional adapter can translate an external room's readiness and launch request into an authorized HEAT admission/world request. It needs an explicit identity mapping between consenting community members and existing HEAT profiles, plus short-lived tickets. Room presence and readiness remain separate from authenticated game participation and Degree evidence.

No such adapter is enabled. There are no external requests or credentials in this implementation. Do not infer a contract from browser session cookies, CSRF handling, private connection-kit values, HTTP route observations or the community app's event websocket. The room developer and owner must approve the interface, identity mapping, data sharing and deployment boundary first. Do not silently merge Discord/community authentication with local HEAT accounts.

## Authenticated remote gameplay adapter

The opt-in `10six-authority-mtls-v1` adapter uses the same intents and award callback. Toast retains all account/native admission routes on loopback and owns the existing identity/economy files; a separate HTTPS mTLS authority owns only game checkpoints and bound participation counters. No remote identity database or duplicate reward policy is created. The connection requires an explicit CA, mutually verified/pinned certificate public keys, TLS 1.3 and server name/IP verification. Host admission generations and persistent ordered intent digests reject application replays. Toast's pending-intent journal reconciles lost replies before awarding.

Configuration source and the exact deferred approval/validation path are in [SECURE-GAMEPLAY-DEPLOYMENT.md](SECURE-GAMEPLAY-DEPLOYMENT.md). Existing loopback launchers/defaults remain unchanged. There is no LAN activation, Harbinger access, persistent credential creation, remote account-route exposure or new bundle upload in this checkpoint.


The shared desktop shell and authenticated player-facing transport are documented in [DESKTOP-PLAYER-CONTROLS.md](DESKTOP-PLAYER-CONTROLS.md). Players use public trust only; Toast remains the single HEAT account/award owner. That document contains the unexecuted bounded v3 deployment proposal.

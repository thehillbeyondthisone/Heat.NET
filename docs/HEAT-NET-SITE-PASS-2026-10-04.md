# HEAT.NET Cohesion and Fidelity Pass

**Date:** October 4, 2026  
**Project:** Local HEAT.NET / 10SIX restoration  
**Branch:** `codex/visitor-bridge`  
**Checkpoint:** `51119f6f6d8f21cc8bfc2ca6b21678151803564a`  
**Local entry point:** <http://127.0.0.1:10660/site/index.html>

## Outcome

HEAT.NET now presents as one connected site instead of a collection of pages with unrelated layouts, navigation, terminology, and historical claims.

Fourteen working routes share one recovered HEAT-era shell, one navigation model, one responsive stylesheet, and one visible evidence vocabulary. The network front page also reads the local Visitor service so the site opens on the actual Pioneer, camp count, HEAT Degree balance, and launcher state rather than a fabricated network population.

The pass deliberately separates three kinds of material:

- **ORIGINAL** — wording, artwork, rules, prices, or structure supported by preserved HEAT captures.
- **RESTORED** — a working local implementation of a historical idea, such as Homebase, profiles, reports, Degree accounting, or the game launcher.
- **EXPANSION** — new Visitor functionality that is useful to the reconstruction but is not presented as recovered HEAT history.

This remains a local reconstruction. It is not a reopened commercial HEAT.NET service.

## Scope Completed

### Shared site shell

The rebuilt pages now consistently use:

- the recovered 636-pixel HEAT masthead and bitmap controls;
- the original 155-pixel blue navigation rail, 15-pixel gutter, and 466-pixel content column on desktop;
- the HEAT dark background, blue rail, green action-link, red network-link, and cyan heading vocabulary;
- the same top-level destinations for Front Page, Homebase, Games, Store, Events/Trophies, News, Players, Search, Help, and Pager;
- a consistent footer and restoration boundary statement;
- skip links, semantic headings, useful alternative text, and current-page navigation state.

The recovered masthead remains horizontally inspectable on narrow screens. At 420 pixels and below, the blue rail becomes a compact two-column navigation band above full-width content so the historical frame remains recognizable without squeezing the page body.

### Route-by-route work

| Route | Result |
| --- | --- |
| `site/index.html` | Rebuilt as the network front page, with source labels, restored channel directory, archive stories, and a live read-only Visitor status panel. |
| `site/games.html` | Replaced invented game descriptions with the captured channel directory and clearly separated playable, archived, and program destinations. |
| `site/store.html` | Recast as a historical display with captured departments, one supported offer, and no fictional checkout or Degree exchange rate. |
| `site/about.html` | Added a direct explanation of the ORIGINAL, RESTORED, and EXPANSION boundary and the project’s current limitations. |
| `site/pages/10six.html` | Preserved the working Visitor connection while aligning global navigation, trophy access, store access, help, Pager, and footer behavior. |
| `site/pages/myhomebase.html` | Preserved the live local profile, Degrees, activity, and trophy cabinet while linking historical awards to the evidence-backed catalogue. |
| `site/pages/degrees.html` | Preserved live Degree accounting and linked it to the restored historical earning guide and untouched source capture. |
| `site/pages/players.html` | Preserved search, comparison, import, export, and local-report behavior while joining the common shell. |
| `site/pages/trophies.html` | Rebuilt the top-level cabinet chooser to separate historical trophies, unverified surviving art, and new Visitor awards. |
| `site/pages/retired-trophies.html` | Rebuilt around the seven recovered retired-trophy criteria and only displays artwork whose local file is a valid image. |
| `site/pages/active-trophies.html` | Reframed 6100 and 6104 as surviving honor art without recovered generic award rules. |
| `site/pages/getpaid.html` | Restored the documented Degree-earning rules and separated them from the local accounting implementation. |
| `site/pages/pager.html` | Removed the fabricated inbox and replaced it with supported community evidence, explicit unknowns, and the working local Players substitute. |
| `site/pages/footsoldiers.html` | Corrected Footsoldiers from an invented tactical mini-game to the documented member-recruitment and community program. |

## Historical Corrections

### Game directory

The captured front page’s channel counts are retained as historical directory claims. They are not presented as a current playable catalogue. The rebuilt Games page does not invent descriptions for titles whose service behavior was not recovered.

### HEAT Store

The previous reconstruction contained unsupported memberships, merchandise descriptions, fictional bonuses, made-up subscription tiers, a Jitter DLC offer, and an invented HEAT Degree cash rate. Those claims were removed.

The rebuilt store preserves:

- the departments visible in the August 2000 capture;
- surviving store and partner artwork whose files are valid;
- the supported listing **“3 Months 10SIX — $25.95”**;
- a clear statement that checkout, subscriptions, and cash redemption are not active.

### HEAT Degrees

The historical earning guide now presents the supported rates:

- 100 Degrees for a daily game launch;
- 250 Degrees for each 60 minutes of active play;
- 5,000 Degrees for launching on 15 days;
- 10,000 Degrees for launching every day in a calendar month;
- 500,000 Degrees for launching every day in a calendar year.

The local service’s attendance calendar, active-minute accumulation, and one-time award accounting are identified as implementation choices. No fixed cash conversion or store redemption rate is claimed.

### Trophies

Historical trophies remain tied to their original membership, event, testing, movie, community, holiday, or Premium Player of the Month criteria. Current camp statistics cannot retroactively earn them.

The rebuilt pages also correct several asset problems:

- `6101.gif` and `6144.gif` are archive error documents rather than valid GIF images and are represented with missing-art placeholders;
- the absent Holiday trophy art is not replaced with invented artwork;
- `21102.gif` is identified as an advertisement, not a Premium Member trophy;
- `6104.gif` visibly names Thunder Crusher, but no generic active-trophy rule is inferred from that artwork;
- 6100 and 6104 remain explicitly unverified as a broader active-award catalogue.

The two current Visitor awards—First Claim and Two-Camp Pioneer—remain visually and semantically separate from the retired HEAT cabinet.

### HEAT Pager and community

The archive supports HEATmail identity, competitive profiles, a 10SIX board and chat room, and the presence of Pager navigation. It does not establish the exact Pager interface or the fabricated friend requests, fictional messages, game invitations, trophy notices, or corporation-war alerts previously shown.

The replacement page therefore documents the known boundary and routes users to Visitor Players, which lists validated local reports without implying public presence.

### Footsoldiers

Footsoldiers was a HEAT member-recruitment and community program. The preserved material supports:

- recruiting new HEAT users;
- 500 Degrees for each registered referral;
- Footsoldier-only raids and contests;
- program access for Premium and Perimeter members.

The prior tactical mission game, rank simulation, and automatic victory rewards were unsupported reconstruction and were removed. Preserved military-themed buttons are displayed as interface artifacts rather than functioning missions.

## Local Visitor Connection

The broader local checkpoint includes a loopback-only Visitor bridge under `visitor/`. The site uses it to expose checked local game information without modifying the native save from the browser.

The working browser surfaces include:

- local Pioneer identity and display-name editing;
- current and imported report selection;
- owned camp, resource, building, rover, loss, and activity summaries;
- HEAT Degree balance and transaction history;
- First Claim and Two-Camp Pioneer awards;
- manual report export and import for local comparison;
- an opt-in launcher path to the native game.

The network front page’s `site/js/portal.js` integration is read-only. It summarizes connection state, Pioneer name, owned camps, HEAT Degrees, and launcher readiness, then directs the user into the detailed 10SIX routes.

## Main Files

### Shared presentation and portal

- `site/css/visitor.css`
- `site/js/portal.js`
- `site/js/visitor.js`
- `site/index.html`
- `site/games.html`
- `site/store.html`
- `site/about.html`

### HEAT and Visitor pages

- `site/pages/10six.html`
- `site/pages/myhomebase.html`
- `site/pages/degrees.html`
- `site/pages/players.html`
- `site/pages/trophies.html`
- `site/pages/retired-trophies.html`
- `site/pages/active-trophies.html`
- `site/pages/getpaid.html`
- `site/pages/pager.html`
- `site/pages/footsoldiers.html`

### Visitor service and validation

- `visitor/bootstrap.cjs`
- `visitor/model.cjs`
- `visitor/server.cjs`
- `visitor/degrees.cjs`
- `visitor/trophies.cjs`
- `visitor/tests/site.test.cjs`
- `visitor/tests/server.test.cjs`
- `visitor/tests/native.test.cjs`
- `visitor/tests/degrees.test.cjs`
- `visitor/tests/trophies.test.cjs`

### Evidence

- `../../../docs/HEAT-NET-EVIDENCE.md`
- `original_archive/` — preserved separately and intentionally not rewritten by this pass.

## Verification Performed

### Automated suite

Command:

```powershell
npm run test:visitor
```

Result on October 4, 2026: **27 tests passed; 0 failed.**

The named suites cover:

- launch-only and active-play Degree rules;
- Chicago calendar days, monthly bonuses, yearly bonuses, pause behavior, and replay protection;
- native launch → play → checked report → Degree and trophy persistence across restart;
- report validation, tamper rejection, import/export, identity behavior, and damaged-state fail-closed behavior;
- loopback server routing, origin enforcement, secret-file exclusions, and safe repeated launch behavior;
- First Claim and Two-Camp Pioneer qualification and persistence;
- all fourteen rebuilt routes, common-shell contracts, local links, image signatures, navigation destinations, and evidence-boundary assertions.

Focused site command:

```powershell
node --test visitor/tests/site.test.cjs
```

Result: **4 site-cohesion tests passed; 0 failed.**

### Rendered browser review

The following rebuilt routes were rendered in the local browser rather than judged from source alone:

- Network Front Page
- Game Channels
- Historical Store
- Trophy Archive
- Footsoldiers
- live 10SIX Channel

The front page and live 10SIX channel were also checked at a 390 × 844 viewport. The browser review confirmed:

- the Visitor connection reached **LOCAL VISITOR CONNECTED / Reports connected**;
- the real local Pioneer, one owned camp, and 100-Degree balance appeared on the front page used for review;
- the local game launch control became enabled;
- no checked rebuilt route contained a broken image;
- no checked rebuilt route produced page-level horizontal overflow;
- no current rebuilt front-page or 10SIX-route console errors were present;
- the narrow-screen body switched to the full-width stacked layout.

This rendered review is evidence that the current routes load and remain usable. It is not a claim of pixel-perfect comparison against every surviving HEAT capture.

## Known Boundaries

- There is no public HEAT.NET server, public multiplayer population, online account service, live Pager, chat, trading, store checkout, subscription system, or cash-redemption service.
- The working site combines archive evidence with a modern local reconstruction. Labels identify that boundary; they do not make the reconstruction historical fact.
- Project Visitor documentation can support later mechanics research but must not be conflated with original HEAT-era behavior.
- The untouched archive retains missing assets, broken Wayback dependencies, and obsolete scripts. Its console errors were not “fixed” by altering source captures.
- The pass did not establish pixel-perfect equivalence for every archived page, browser, or historical screen resolution.
- Passing browser and automated checks do not prove real public-network behavior, physical-device behavior, long-session performance, or final human visual approval.

## Running the Site

From `integration-workspaces/heat-net`:

```powershell
npm start
```

Then open:

```text
http://127.0.0.1:10660/site/index.html
```

Run the complete Visitor and site suite with:

```powershell
npm run test:visitor
```

## Change-Control Note

Checkpoint `51119f6` records 33 files changed, with 2,750 insertions and 3,932 deletions relative to `e9cdb6d`. Its commit message explicitly identifies it as a local checkpoint that has not been pushed or published.

This report was added after that checkpoint and therefore remains a separate working-tree document until intentionally committed.

## Reasonable Next Passes

1. Perform page-by-page visual comparison against selected dated captures and record specific mismatches rather than pursuing a vague “more authentic” target.
2. Decide whether the next priority is stricter frozen-capture fidelity or additional clearly labeled restored services.
3. If communication features are desired, design them as a new local expansion with explicit identity and safety rules rather than inferring an unrecovered Pager protocol.
4. Continue replacing archive-error assets only when a valid original copy is found; otherwise retain the explicit missing-art treatment.

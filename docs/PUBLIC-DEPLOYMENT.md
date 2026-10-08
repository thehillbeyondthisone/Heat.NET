# Public HEAT.NET website

The public release is a static portal with fourteen restored pages and the preserved website archive. It is hosted at https://thehillbeyondthisone.github.io/Heat.NET/ through GitHub Pages.

`npm run build` validates every restored route, link, fragment and displayed image before assembling `_site/`. The publish allowlist contains only `index.html`, `site/` and `original_archive/`. The build rejects native game files and private directories. `_site/release.json` identifies the deployed commit and content boundary.

The public repository and deployment exclude the 10Six native game, recovered game resources, rules, saves, local Visitor backend, account credentials, reports and launcher code. The restored 10SIX channel retains historical website artwork and links to the original channel capture.

Homebase, Players and Degrees on the public site are historical browsing pages. They do not call the private local service or offer public account registration. The local integrated portal is maintained separately.

Pushing `main` triggers `.github/workflows/pages.yml`. After the workflow succeeds, verify the live `release.json` commit and the restored routes. Original archive markup is preserved; damaged external archive links are not rewritten.

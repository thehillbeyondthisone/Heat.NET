import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, '_site');
const routes = ['site/index.html', 'site/games.html', 'site/store.html', 'site/about.html',
  ...['10six', 'myhomebase', 'degrees', 'players', 'trophies', 'retired-trophies', 'active-trophies', 'getpaid', 'pager', 'footsoldiers'].map(name => `site/pages/${name}.html`)];
const allowed = ['index.html', 'site', 'original_archive'];
function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Symlink in public content: ${file}`);
    return entry.isDirectory() ? files(file) : [file];
  });
}
function requireCondition(ok, message) { if (!ok) throw new Error(message); }
let references = 0;
for (const route of routes) {
  const html = readFileSync(path.join(root, route), 'utf8');
  requireCondition(/class="heat-site"/.test(html) && /name="viewport"/.test(html), `${route}: restored responsive shell missing`);
  requireCondition(!/data-launch|data-visitor-page|data-portal-status|\/api\/visitor|Connecting…|Loading (?:camp|pioneer|activity)|id="(?:register|login|import)-form"/.test(html), `${route}: local service dependency present`);
  for (const [, attribute, reference] of html.matchAll(/\b(src|href)="([^"]+)"/g)) {
    if (/^(?:https?:|mailto:|data:)/i.test(reference)) continue;
    requireCondition(!reference.startsWith('/'), `${route}: root-relative URL breaks project hosting: ${reference}`);
    const [clean, fragment] = reference.split('#');
    const pathname = decodeURIComponent(clean.split('?')[0]);
    const target = pathname ? path.resolve(root, path.dirname(route), pathname) : path.join(root, route);
    const relative = path.relative(root, target);
    requireCondition(allowed.some(item => relative === item || relative.startsWith(item + path.sep)), `${route}: non-website reference ${reference}`);
    requireCondition(existsSync(target), `${route}: missing ${reference}`);
    if (fragment && target.includes(`${path.sep}site${path.sep}`) && target.endsWith('.html')) {
      requireCondition(new RegExp(`\\bid=["']${fragment}["']`).test(readFileSync(target, 'utf8')), `${route}: missing fragment ${reference}`);
    }
    if (attribute === 'src' && /\.(?:gif|jpe?g|png)$/i.test(target)) {
      const bytes = readFileSync(target), extension = path.extname(target).toLowerCase();
      const valid = extension === '.gif' ? bytes.subarray(0, 4).toString() === 'GIF8'
        : extension === '.png' ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
        : bytes[0] === 255 && bytes[1] === 216;
      requireCondition(valid, `${route}: invalid image ${reference}`);
    }
    references++;
  }
}
for (const item of allowed) {
  const source = path.join(root, item);
  for (const file of statSync(source).isDirectory() ? files(source) : [source]) {
    requireCondition(!/\.(?:gd|gdshader|tscn|tres|pck|exe|dll|pvk|ecl|pem|key)$/i.test(file), `Game or private file in public content: ${file}`);
    requireCondition(!/(?:^|[\\/])(?:saves|recovery|playable|visitor|\.local|\.git|node_modules)(?:[\\/]|$)/i.test(path.relative(root, file)), `Private directory in public content: ${file}`);
  }
}
mkdirSync(output, { recursive: true });
for (const item of allowed) cpSync(path.join(root, item), path.join(output, item), { recursive: true });
writeFileSync(path.join(output, '.nojekyll'), '');
const manifest = { version: 1, commit: process.env.GITHUB_SHA || 'local-preview', routes: routes.length,
  files: files(output).filter(file => file !== path.join(output, 'release.json')).length + 1,
  game_included: false, local_service_included: false, checked_references: references };
writeFileSync(path.join(output, 'release.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify(manifest));

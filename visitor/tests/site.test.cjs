'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const pages = [
  'site/index.html',
  'site/games.html',
  'site/store.html',
  'site/about.html',
  'site/pages/10six.html',
  'site/pages/myhomebase.html',
  'site/pages/degrees.html',
  'site/pages/players.html',
  'site/pages/trophies.html',
  'site/pages/retired-trophies.html',
  'site/pages/active-trophies.html',
  'site/pages/getpaid.html',
  'site/pages/pager.html',
  'site/pages/footsoldiers.html'
];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function localTarget(page, reference) {
  const clean = reference.split('#')[0].split('?')[0];
  if (!clean || /^(?:https?:|mailto:|javascript:|data:)/i.test(clean)) return null;
  const decoded = decodeURIComponent(clean);
  const target = decoded.startsWith('/')
    ? path.resolve(root, decoded.slice(1))
    : path.resolve(root, path.dirname(page), decoded);
  assert.ok(target === root || target.startsWith(root + path.sep), `${page}: reference escapes the project: ${reference}`);
  return target;
}

function assertImageSignature(target, page, reference) {
  const bytes = fs.readFileSync(target);
  const extension = path.extname(target).toLowerCase();
  if (extension === '.gif') {
    assert.ok(bytes.subarray(0, 4).toString('ascii') === 'GIF8', `${page}: invalid GIF payload: ${reference}`);
  } else if (extension === '.jpg' || extension === '.jpeg') {
    assert.ok(bytes[0] === 0xff && bytes[1] === 0xd8, `${page}: invalid JPEG payload: ${reference}`);
  } else if (extension === '.png') {
    assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], `${page}: invalid PNG payload: ${reference}`);
  }
}

test('rebuilt HEAT.NET routes share the restored shell and local assets resolve', () => {
  for (const page of pages) {
    const html = read(page);
    assert.match(html, /<meta name="viewport"/i, `${page}: responsive viewport missing`);
    assert.match(html, /css\/visitor\.css/i, `${page}: shared stylesheet missing`);
    assert.match(html, /class="heat-site"/i, `${page}: shared HEAT shell missing`);
    assert.match(html, /class="skip-link"/i, `${page}: skip link missing`);
    assert.match(html, /nav_cobrand\.gif/i, `${page}: recovered masthead missing`);

    for (const match of html.matchAll(/\b(src|href)="([^"]+)"/gi)) {
      const target = localTarget(page, match[2]);
      if (!target) continue;
      assert.ok(fs.existsSync(target), `${page}: missing local ${match[1]} target: ${match[2]}`);
      if (match[1].toLowerCase() === 'src' && /\.(?:gif|jpe?g|png)$/i.test(target)) {
        assertImageSignature(target, page, match[2]);
      }
    }
  }
});

test('primary navigation has one coherent destination map', () => {
  for (const page of pages) {
    const html = read(page);
    assert.match(html, /(?:\.\.\/)?games\.html/, `${page}: games route missing`);
    assert.match(html, /(?:\.\.\/)?store\.html/, `${page}: restored store route missing`);
    assert.match(html, /(?:pages\/)?trophies\.html|trophies\.html/, `${page}: trophy archive route missing`);
    assert.match(html, /(?:\.\.\/)?about\.html/, `${page}: restoration help route missing`);
    assert.match(html, /pager\.html/, `${page}: pager route missing`);
  }
});

test('restored pages keep archive facts separate from Visitor additions', () => {
  const siteText = pages.map(read).join('\n');
  for (const invented of [
    'Jitter Pack DLC',
    '10,000 Degrees = $1',
    'Corporation War Alert',
    'TROPHY SYSTEM - NOW LIVE'
  ]) {
    assert.doesNotMatch(siteText, new RegExp(invented.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  }

  assert.match(read('site/store.html'), /3 Months 10SIX[^\n]*\$25\.95/i);
  assert.doesNotMatch(read('site/store.html'), /\$4\.95\s*\/\s*month/i);
  assert.match(read('site/pages/footsoldiers.html'), /500 Degrees/i);
  assert.match(read('site/pages/footsoldiers.html'), /community[- ]recruitment program/i);
  assert.match(read('site/pages/footsoldiers.html'), /previous reconstructed page/i);
  assert.match(read('site/pages/pager.html'), /NOT RECOVERED/i);
  assert.match(read('site/pages/pager.html'), /exact Pager UI (?:is|are) not corroborated/i);
  assert.doesNotMatch(read('site/pages/pager.html'), /onclick=|alert\s*\(/i);
  assert.match(read('site/pages/trophies.html'), /21102\.gif/i);
  assert.match(read('site/pages/trophies.html'), /advertisement/i);
});

test('live Visitor routes retain their bridge contracts', () => {
  const contracts = new Map([
    ['site/pages/10six.html', 'channel'],
    ['site/pages/myhomebase.html', 'home'],
    ['site/pages/degrees.html', 'degrees'],
    ['site/pages/players.html', 'players']
  ]);
  for (const [page, value] of contracts) {
    const html = read(page);
    assert.match(html, new RegExp(`data-visitor-page="${value}"`));
    assert.match(html, /js\/visitor\.js/i);
    assert.match(html, /data-launch/);
  }
});

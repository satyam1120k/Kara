/**
 * Stamps a new release before every deploy (run by `npm run deploy`).
 *
 *  - public/version.json   what the server says is the latest release:
 *        { web: "<build id>", notes, apk: { versionCode, versionName, url } }
 *  - public/index.html     <meta name="kara-build"> = the build the page was loaded from
 *  - public/sw.js          new cache name, so old offline copies are replaced
 *
 * Open pages and the Android app compare their build with version.json and
 * offer "Update" when they differ. Release notes: put a line in
 * RELEASE_NOTES.txt (optional).
 */

import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = (p) => join(root, 'public', p);

const now = new Date();
const build = now.toISOString().replace(/[-:T]/g, '').slice(0, 12) + '-' + Math.random().toString(36).slice(2, 6);

// Latest APK (if one has been built and copied into public/downloads)
let apk = null;
const gradle = join(root, 'mobile', 'android', 'app', 'build.gradle');
if (existsSync(pub('downloads/kara.apk')) && existsSync(gradle)) {
  const g = readFileSync(gradle, 'utf8');
  apk = {
    versionCode: Number(g.match(/versionCode\s+(\d+)/)[1]),
    versionName: g.match(/versionName\s+"([^"]+)"/)[1],
    url: '/downloads/kara.apk',
    sizeMB: +(statSync(pub('downloads/kara.apk')).size / 1048576).toFixed(1)
  };
}

const notesFile = join(root, 'RELEASE_NOTES.txt');
const notes = existsSync(notesFile) ? readFileSync(notesFile, 'utf8').trim().split(/\r?\n/)[0] : '';

const version = { web: build, releasedAt: now.toISOString(), notes, apk };
writeFileSync(pub('version.json'), JSON.stringify(version, null, 2) + '\n');

// The page remembers which build it is
let html = readFileSync(pub('index.html'), 'utf8');
const meta = `<meta name="kara-build" content="${build}">`;
html = /<meta name="kara-build"[^>]*>/.test(html)
  ? html.replace(/<meta name="kara-build"[^>]*>/, meta)
  : html.replace('<meta charset="UTF-8">', `<meta charset="UTF-8">\n  ${meta}`);
writeFileSync(pub('index.html'), html);

// Fresh offline cache for the new release
let sw = readFileSync(pub('sw.js'), 'utf8');
sw = sw.replace(/const CACHE_VERSION = '[^']*';/, `const CACHE_VERSION = 'kara-${build}';`);
writeFileSync(pub('sw.js'), sw);

console.log(`Release stamped: web ${build}` + (apk ? `, app v${apk.versionName} (build ${apk.versionCode})` : ', no APK'));

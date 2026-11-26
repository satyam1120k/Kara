/**
 * Builds a new signed Android APK (run by `npm run release:app`).
 *
 *  1. Bumps versionCode (+1) and versionName (e.g. 1.1 -> 1.2, or pass one: `-- 2.0`)
 *  2. Tells the app its build number (user agent "KaraBuild/<code>"), so the
 *     update check works even without native plugins
 *  3. Syncs Capacitor, builds a release APK with JDK 21, signs it with
 *     mobile/keystore, and copies it to public/downloads/kara.apk
 *
 * Then deploy (`npm run deploy`, done automatically by release:app) and every
 * installed app will show "App update available".
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, copyFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import os from 'node:os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const mobile = join(root, 'mobile');
const android = join(mobile, 'android');
const gradleFile = join(android, 'app', 'build.gradle');
const capConfigFile = join(mobile, 'capacitor.config.json');

if (!existsSync(join(mobile, 'keystore', 'keystore.properties'))) {
  console.error('Missing mobile/keystore/keystore.properties: the signing key is needed to build updates.');
  process.exit(1);
}

// 1. Version bump
let g = readFileSync(gradleFile, 'utf8');
const code = Number(g.match(/versionCode\s+(\d+)/)[1]) + 1;
const oldName = g.match(/versionName\s+"([^"]+)"/)[1];
const [maj, min = 0] = oldName.split('.').map(Number);
const name = process.argv[2] || `${maj}.${min + 1}`;
g = g.replace(/versionCode\s+\d+/, `versionCode ${code}`).replace(/versionName\s+"[^"]+"/, `versionName "${name}"`);
writeFileSync(gradleFile, g);

// 2. Build number in the user agent
const cap = JSON.parse(readFileSync(capConfigFile, 'utf8'));
cap.android = { ...cap.android, appendUserAgent: `KaraApp/${name} KaraBuild/${code}` };
writeFileSync(capConfigFile, JSON.stringify(cap, null, 2) + '\n');
console.log(`Building KĀRA app v${name} (build ${code})…`);

// 3. Tools: JDK 21 and a Gradle that works with Android plugin 8.x (<= 9.5)
function findJdk() {
  if (process.env.KARA_JAVA_HOME) return process.env.KARA_JAVA_HOME;
  const candidates = [];
  const javaDir = 'C:/Program Files/Java';
  if (existsSync(javaDir)) {
    for (const d of readdirSync(javaDir)) if (/^jdk-2[1-9]/.test(d)) candidates.push(join(javaDir, d));
  }
  candidates.push('C:/Program Files/Android/Android Studio/jbr');
  return candidates.find(p => existsSync(join(p, 'bin', 'java.exe')) || existsSync(join(p, 'bin', 'java')));
}

function findGradle() {
  const dists = join(os.homedir(), '.gradle', 'wrapper', 'dists');
  if (existsSync(dists)) {
    const ok = readdirSync(dists)
      .map(d => d.match(/^gradle-(\d+)\.(\d+)(?:\.(\d+))?-bin$/))
      .filter(m => m && (Number(m[1]) < 9 || (Number(m[1]) === 9 && Number(m[2]) <= 5)) && Number(m[1]) >= 8)
      .sort((a, b) => (b[1] - a[1]) || (b[2] - a[2]) || ((b[3] || 0) - (a[3] || 0)));
    for (const m of ok) {
      const base = join(dists, m[0]);
      for (const hash of readdirSync(base)) {
        const bin = join(base, hash, m[0].replace(/-bin$/, ''), 'bin', process.platform === 'win32' ? 'gradle.bat' : 'gradle');
        if (existsSync(bin)) return `"${bin}"`;
      }
    }
  }
  return process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
}

const jdk = findJdk();
if (!jdk) {
  console.error('JDK 21 not found. Install it or set KARA_JAVA_HOME.');
  process.exit(1);
}
const env = { ...process.env, JAVA_HOME: jdk };
const run = (cmd, cwd) => execSync(cmd, { cwd, env, stdio: 'inherit' });

run('npx cap sync android', mobile);
run(`${findGradle()} assembleRelease --no-daemon -q`, android);

const built = join(android, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
mkdirSync(join(root, 'public', 'downloads'), { recursive: true });
copyFileSync(built, join(root, 'public', 'downloads', 'kara.apk'));
console.log(`✔ APK v${name} (build ${code}) copied to public/downloads/kara.apk`);

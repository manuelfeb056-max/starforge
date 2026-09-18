/** Build + run a headless smoke test (node ESM can't resolve extensionless TS imports).
 * Usage: node scripts/run-smoke.cjs [host|game]  (default: host)
 */
const esbuild = require('esbuild');
const path = require('path');
const { execFileSync } = require('child_process');

async function main() {
  const which = process.argv[2] === 'game' ? 'smoke-game.mts' : 'smoke-host.mts';
  const out = path.join(__dirname, '.smoke.mjs');
  await esbuild.build({
    entryPoints: [path.join(__dirname, which)],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: out,
    logLevel: 'silent',
  });
  try {
    execFileSync(process.execPath, [out], { stdio: 'inherit', cwd: path.join(__dirname, '..') });
  } finally {
    require('fs').rmSync(out, { force: true });
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

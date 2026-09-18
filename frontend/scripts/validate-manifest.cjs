/**
 * Build step: validate public/game.manifest.json with the SDK's
 * validateCasinoGameManifest (zod). Bundles src/sdk/manifest.ts on the fly
 * with esbuild so the app bundle never includes zod.
 */
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const manifestPath = path.join(root, 'public', 'game.manifest.json');

async function main() {
  const raw = fs.readFileSync(manifestPath, 'utf8');
  const manifest = JSON.parse(raw);

  const outFile = path.join(__dirname, '.manifest-check.cjs');
  await esbuild.build({
    entryPoints: [path.join(root, 'src', 'sdk', 'manifest.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile: outFile,
    logLevel: 'silent',
  });
  const { validateCasinoGameManifest } = require(outFile);
  const result = validateCasinoGameManifest(manifest);
  fs.rmSync(outFile, { force: true });

  if (!result.ok) {
    console.error(`[manifest] INVALID: ${result.reason}`);
    process.exit(1);
  }
  console.log(`[manifest] valid — gameId=${result.manifest.gameId}`);
}

main().catch(err => {
  console.error('[manifest] validation crashed:', err);
  process.exit(1);
});

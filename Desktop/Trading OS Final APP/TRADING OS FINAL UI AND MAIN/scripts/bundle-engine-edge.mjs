/**
 * Bundles src/engine for Deno (Supabase Edge). Run before `supabase functions deploy engine-proxy`.
 */
import * as esbuild from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outfile = join(root, 'supabase/functions/engine-proxy/bundle.mjs');

await esbuild.build({
  entryPoints: [join(root, 'src/engine/edge-entry.ts')],
  bundle: true,
  outfile,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  logLevel: 'info',
  legalComments: 'none',
});

console.log('Wrote', outfile);

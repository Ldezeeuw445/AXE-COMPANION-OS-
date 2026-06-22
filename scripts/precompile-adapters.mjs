#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// Prefer the explicit AXE-COMPANION-OS- adapters folder, but fall back to the
// general adapters folder so CI is robust to small path/layout differences.
const PREFERRED_DIR = path.resolve(process.cwd(), 'src/lib/broker/hub/adapters/AXE-COMPANION-OS-');
const FALLBACK_DIR = path.resolve(process.cwd(), 'src/lib/broker/hub/adapters');
let ADAPTERS_DIR = PREFERRED_DIR;
if (!fs.existsSync(ADAPTERS_DIR) && fs.existsSync(FALLBACK_DIR)) {
  ADAPTERS_DIR = FALLBACK_DIR;
}

function findTsFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let results = [];
  for (const ent of entries) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) results = results.concat(findTsFiles(p));
    else if (ent.isFile() && ent.name.endsWith('.ts')) results.push(p);
  }
  return results;
}

function tryEsbuildCompile(files) {
  try {
    // try require esbuild from local node_modules
    // eslint-disable-next-line
    const esbuild = require(path.join(process.cwd(), 'node_modules', 'esbuild'));
    console.log('Using local esbuild to compile adapters...');
    for (const file of files) {
      const out = file.replace(/\.ts$/, '.js');
      esbuild.buildSync({ entryPoints: [file], outfile: out, platform: 'node', format: 'cjs', bundle: false });
      console.log('Wrote', out);
    }
    return true;
  } catch (err) {
    return false;
  }
}

function tryTscCompile(files) {
  console.log('Falling back to tsc via npx (requires network or local typescript)');
  const tmpConfigPath = path.join(process.cwd(), 'tmp-tsconfig.adapters.json');
  const tmpOut = path.join(process.cwd(), 'tmp-adapters');
  const cfg = {
    compilerOptions: {
      module: 'CommonJS',
      target: 'ES2019',
      outDir: tmpOut,
      esModuleInterop: true,
      skipLibCheck: true,
      resolveJsonModule: true
    },
    files: files
  };
  fs.writeFileSync(tmpConfigPath, JSON.stringify(cfg, null, 2));
  const res = spawnSync('npx', ['tsc', '-p', tmpConfigPath], { stdio: 'inherit' });
  try { fs.rmSync(tmpConfigPath); } catch {}
  return res.status === 0;
}

(async function main(){
  if (!fs.existsSync(ADAPTERS_DIR)) {
    console.error('Adapters dir not found. Tried:', PREFERRED_DIR, 'and', FALLBACK_DIR);
    process.exit(1);
  }
  const tsFiles = findTsFiles(ADAPTERS_DIR);
  if (!tsFiles.length) {
    console.log('No TypeScript adapter files found to compile in', ADAPTERS_DIR);
    process.exit(0);
  }

  if (tryEsbuildCompile(tsFiles)) {
    console.log('Adapters compiled with esbuild.');
    process.exit(0);
  }

  if (tryTscCompile(tsFiles)) {
    console.log('Adapters compiled with tsc (output to tmp-adapters).');
    process.exit(0);
  }

  console.error('Could not compile adapters automatically. Install esbuild locally (`npm i -D esbuild`) or ensure `npx tsc` works.');
  process.exit(2);
})();
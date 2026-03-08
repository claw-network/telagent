#!/usr/bin/env node
/**
 * bump-version.mjs — bump the version across the entire monorepo.
 *
 * Usage:
 *   node scripts/bump-version.mjs patch   # 0.2.0 → 0.2.1
 *   node scripts/bump-version.mjs minor   # 0.2.0 → 0.3.0
 *   node scripts/bump-version.mjs major   # 0.2.0 → 1.0.0
 *   node scripts/bump-version.mjs 1.5.0   # explicit version
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ── helpers ──────────────────────────────────────────────────────────────────

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJson(path, obj) {
  writeFileSync(path, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

function bumpSemver(current, bump) {
  const [major, minor, patch] = current.split('.').map(Number);
  switch (bump) {
    case 'major': return `${major + 1}.0.0`;
    case 'minor': return `${major}.${minor + 1}.0`;
    case 'patch': return `${major}.${minor}.${patch + 1}`;
    default:
      // validate it looks like a semver
      if (!/^\d+\.\d+\.\d+/.test(bump)) {
        console.error(`ERROR: "${bump}" is not a valid bump type (patch|minor|major) or semver string.`);
        process.exit(1);
      }
      return bump;
  }
}

// ── collect package.json paths ───────────────────────────────────────────────

// Parse package globs from pnpm-workspace.yaml (simple line-based, no full YAML parser needed)
const raw = readFileSync(resolve(ROOT, 'pnpm-workspace.yaml'), 'utf8');
const globs = raw
  .split('\n')
  .filter(l => l.trim().startsWith('-'))
  .map(l => l.replace(/^\s*-\s*['"]?/, '').replace(/['"]?\s*$/, '').trim());

const paths = [resolve(ROOT, 'package.json')];

for (const glob of globs) {
  // Only handle simple "packages/*" style globs (replace * with actual dirs)
  const base = glob.replace(/\/\*.*$/, '');
  const { readdirSync, statSync } = await import('node:fs');
  let entries;
  try {
    entries = readdirSync(resolve(ROOT, base));
  } catch {
    continue;
  }
  for (const entry of entries) {
    const pkgJson = resolve(ROOT, base, entry, 'package.json');
    try {
      statSync(pkgJson);
      paths.push(pkgJson);
    } catch {
      // no package.json in this entry
    }
  }
}

// ── main ─────────────────────────────────────────────────────────────────────

const bump = process.argv[2];
if (!bump) {
  console.error('Usage: node scripts/bump-version.mjs <patch|minor|major|x.y.z>');
  process.exit(1);
}

const rootPkg = readJson(paths[0]);
const current = rootPkg.version;
const next = bumpSemver(current, bump);

console.log(`\nBumping version: ${current} → ${next}\n`);

for (const pkgPath of paths) {
  const pkg = readJson(pkgPath);
  if (!pkg.version) continue;
  pkg.version = next;
  writeJson(pkgPath, pkg);
  const rel = pkgPath.replace(ROOT + '/', '');
  console.log(`  ✓  ${rel}`);
}

console.log(`\nDone. All packages updated to ${next}.`);
console.log(`\nNext steps:`);
console.log(`  git add -A && git commit -m "chore: bump version to ${next}"`);
console.log(`  git tag v${next}`);

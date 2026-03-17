#!/usr/bin/env node
/**
 * bump-version.mjs — CalVer version bumping for the TelAgent monorepo.
 *
 * Usage:
 *   node scripts/bump-version.mjs release          # 2026.1.0 → 2026.2.0
 *   node scripts/bump-version.mjs patch             # 2026.1.0 → 2026.1.1
 *   node scripts/bump-version.mjs 2026.5            # explicit version
 *   node scripts/bump-version.mjs release --dry     # preview only
 *
 * CalVer format (see docs/versioning/CALVER.md):
 *   YEAR.SEQ          — release (git tag)
 *   YEAR.SEQ.PATCH    — patch   (git tag)
 *
 * package.json always stores 3-segment: 2026.1.0 (release) or 2026.1.1 (patch).
 * Git tags use the canonical form: 2026.1 or 2026.1.1.
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const DRY = process.argv.includes('--dry');

// ── helpers ──────────────────────────────────────────────────────────────────

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJson(path, obj) {
  writeFileSync(path, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

/** Parse a 3-segment CalVer string from package.json (e.g. "2026.1.0") */
function parseCalVer(version) {
  const m = version.match(/^(\d{4})\.(\d+)\.(\d+)$/);
  if (!m) return null;
  return { year: Number(m[1]), seq: Number(m[2]), patch: Number(m[3]) };
}

/** Compute the next CalVer (always returns 3-segment for package.json) */
function bumpCalVer(current, type) {
  const currentYear = new Date().getFullYear();
  const parsed = parseCalVer(current);

  if (type === 'release') {
    if (!parsed) return `${currentYear}.1.0`;                     // first migration
    if (currentYear > parsed.year) return `${currentYear}.1.0`;   // new year reset
    return `${parsed.year}.${parsed.seq + 1}.0`;                  // normal increment
  }

  if (type === 'patch') {
    if (!parsed) {
      console.error('ERROR: Cannot patch a non-CalVer version. Run "release" first.');
      process.exit(1);
    }
    return `${parsed.year}.${parsed.seq}.${parsed.patch + 1}`;
  }

  // explicit version — accept 2-seg or 3-seg CalVer
  const m2 = type.match(/^(\d{4})\.(\d+)$/);
  if (m2) return `${m2[1]}.${m2[2]}.0`;
  const m3 = type.match(/^(\d{4})\.(\d+)\.(\d+)$/);
  if (m3) return type;

  console.error(`ERROR: "${type}" is not a valid CalVer (release|patch|YEAR.SEQ[.PATCH]).`);
  process.exit(1);
}

/** Convert 3-segment package version to canonical tag form (strip trailing .0) */
function toTagVersion(pkgVersion) {
  return pkgVersion.replace(/\.0$/, '');
}

// ── collect package.json paths ───────────────────────────────────────────────

const raw = readFileSync(resolve(ROOT, 'pnpm-workspace.yaml'), 'utf8');
const globs = raw
  .split('\n')
  .filter(l => l.trim().startsWith('-'))
  .map(l => l.replace(/^\s*-\s*['"]?/, '').replace(/['"]?\s*$/, '').trim());

const pkgPaths = [resolve(ROOT, 'package.json')];

for (const glob of globs) {
  const base = glob.replace(/\/\*.*$/, '');
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
      pkgPaths.push(pkgJson);
    } catch {
      // no package.json in this entry
    }
  }
}

// ── discover pyproject.toml ──────────────────────────────────────────────────

const pyprojectPaths = [];
for (const glob of globs) {
  const base = glob.replace(/\/\*.*$/, '');
  let entries;
  try {
    entries = readdirSync(resolve(ROOT, base));
  } catch {
    continue;
  }
  for (const entry of entries) {
    const toml = resolve(ROOT, base, entry, 'pyproject.toml');
    try {
      statSync(toml);
      pyprojectPaths.push(toml);
    } catch {
      // no pyproject.toml
    }
  }
}

// ── main ─────────────────────────────────────────────────────────────────────

const bump = process.argv[2];
if (!bump) {
  console.error('Usage: node scripts/bump-version.mjs <release|patch|YEAR.SEQ[.PATCH]> [--dry]');
  process.exit(1);
}

const rootPkg = readJson(pkgPaths[0]);
const current = rootPkg.version;
const next = bumpCalVer(current, bump);
const tag = toTagVersion(next);

console.log(`\n${DRY ? '[DRY RUN] ' : ''}Bumping version: ${current} → ${next}  (tag: ${tag})\n`);

if (!DRY) {
  for (const pkgPath of pkgPaths) {
    const pkg = readJson(pkgPath);
    if (!pkg.version) continue;
    pkg.version = next;
    writeJson(pkgPath, pkg);
    console.log(`  ✓  ${pkgPath.replace(ROOT + '/', '')}`);
  }

  for (const tomlPath of pyprojectPaths) {
    let content = readFileSync(tomlPath, 'utf8');
    content = content.replace(/^version\s*=\s*"[^"]*"/m, `version = "${tag}"`);
    writeFileSync(tomlPath, content, 'utf8');
    console.log(`  ✓  ${tomlPath.replace(ROOT + '/', '')}`);
  }
}

console.log(`\nDone. All packages updated to ${next}.`);
console.log(`\nNext steps:`);
console.log(`  git add -A && git commit -m "chore: bump to ${tag}"`);
console.log(`  git tag ${tag}`);
console.log(`  git push && git push origin ${tag}`);

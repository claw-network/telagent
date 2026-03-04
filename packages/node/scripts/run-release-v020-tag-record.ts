import { execSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

interface TagRecordManifest {
  phase: 'Release';
  taskId: 'TA-RLS-006';
  generatedAt: string;
  release: {
    version: string;
    targetTag: string;
    branchAtTagTime: string;
    commit: string;
    tagType: 'annotated' | 'lightweight';
    tagMessage: string;
    pushedToOrigin: boolean;
  };
  inputs: {
    preflightManifest: string;
    dualCloudManifest: string;
    rollbackManifest: string;
    releaseNoteDocument: string;
  };
  checks: {
    preflightReadyForTag: boolean;
    dualCloudPass: boolean;
    rollbackDrillPass: boolean;
    releaseNoteExists: boolean;
    localTagExists: boolean;
    remoteTagExists: boolean;
  };
  decision: 'RELEASED' | 'BLOCKED';
}

function ensure(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

async function readJson<T>(filePath: string): Promise<T> {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw) as T;
}

function commandOutput(repoRoot: string, cmd: string): string {
  return execSync(cmd, {
    cwd: repoRoot,
    stdio: 'pipe',
    encoding: 'utf8',
  }).trim();
}

function hasLocalTag(repoRoot: string, tag: string): boolean {
  try {
    commandOutput(repoRoot, `git rev-parse -q --verify refs/tags/${tag}`);
    return true;
  } catch {
    return false;
  }
}

function hasRemoteTag(repoRoot: string, tag: string): boolean {
  try {
    const output = commandOutput(repoRoot, `git ls-remote --tags origin refs/tags/${tag}`);
    return output.length > 0;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptDir, '../../..');

  const releaseVersion = process.env.TELAGENT_RELEASE_VERSION ?? '0.2.0';
  const targetTag = process.env.TELAGENT_RELEASE_TAG ?? `v${releaseVersion}`;

  const preflightManifest = path.resolve(
    repoRoot,
    process.env.TELAGENT_RELEASE_V020_PREFLIGHT_MANIFEST ??
      'docs/implementation/release/manifests/2026-03-04-v0.2.0-release-preflight.json',
  );
  const dualCloudManifest = path.resolve(
    repoRoot,
    process.env.TELAGENT_RELEASE_V020_DUAL_SMOKE_MANIFEST ??
      'docs/implementation/release/manifests/2026-03-04-v0.2.0-dual-cloud-smoke-check.json',
  );
  const rollbackManifest = path.resolve(
    repoRoot,
    process.env.TELAGENT_RELEASE_V020_ROLLBACK_MANIFEST ??
      'docs/implementation/release/manifests/2026-03-04-v0.2.0-rollback-drill.json',
  );
  const releaseNoteDocument = path.resolve(
    repoRoot,
    process.env.TELAGENT_RELEASE_V020_NOTE_DOC ??
      'docs/implementation/release/ta-rls-006-v0.2.0-tag-and-release-note-2026-03-04.md',
  );

  const outputPath =
    process.env.TELAGENT_RELEASE_V020_TAG_RECORD_OUTPUT_PATH ??
    path.resolve(repoRoot, 'docs/implementation/release/manifests/2026-03-04-v0.2.0-release-tag.json');

  const [preflight, dualCloud, rollback] = await Promise.all([
    readJson<{ decision?: string }>(preflightManifest),
    readJson<{ decision?: string }>(dualCloudManifest),
    readJson<{ decision?: string }>(rollbackManifest),
  ]);

  const releaseNoteExists = await fs
    .access(releaseNoteDocument)
    .then(() => true)
    .catch(() => false);

  const localTagExists = hasLocalTag(repoRoot, targetTag);
  const remoteTagExists = hasRemoteTag(repoRoot, targetTag);

  const commit = localTagExists ? commandOutput(repoRoot, `git rev-list -n 1 ${targetTag}`) : '';
  const tagType = localTagExists
    ? (commandOutput(repoRoot, `git cat-file -t refs/tags/${targetTag}`) === 'tag' ? 'annotated' : 'lightweight')
    : 'lightweight';
  const tagMessage = localTagExists
    ? commandOutput(repoRoot, `git tag -l --format='%(subject)' ${targetTag}`)
    : '';
  const branch = commandOutput(repoRoot, 'git rev-parse --abbrev-ref HEAD');

  const checks = {
    preflightReadyForTag: preflight.decision === 'READY_FOR_TAG',
    dualCloudPass: dualCloud.decision === 'PASS',
    rollbackDrillPass: rollback.decision === 'PASS',
    releaseNoteExists,
    localTagExists,
    remoteTagExists,
  };

  const decision: TagRecordManifest['decision'] = Object.values(checks).every(Boolean) ? 'RELEASED' : 'BLOCKED';

  const manifest: TagRecordManifest = {
    phase: 'Release',
    taskId: 'TA-RLS-006',
    generatedAt: new Date().toISOString(),
    release: {
      version: releaseVersion,
      targetTag,
      branchAtTagTime: branch,
      commit,
      tagType,
      tagMessage,
      pushedToOrigin: remoteTagExists,
    },
    inputs: {
      preflightManifest: path.relative(repoRoot, preflightManifest),
      dualCloudManifest: path.relative(repoRoot, dualCloudManifest),
      rollbackManifest: path.relative(repoRoot, rollbackManifest),
      releaseNoteDocument: path.relative(repoRoot, releaseNoteDocument),
    },
    checks,
    decision,
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  console.log(`[TA-RLS-006] decision=${manifest.decision}`);
  console.log(`[TA-RLS-006] output=${outputPath}`);

  ensure(manifest.decision === 'RELEASED', 'release tag record is blocked');
}

main().catch((error) => {
  console.error('[TA-RLS-006] release tag record failed');
  console.error(error);
  process.exitCode = 1;
});

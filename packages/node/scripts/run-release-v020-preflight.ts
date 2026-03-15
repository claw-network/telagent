import { execSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

interface PreflightCheck {
  id: string;
  title: string;
  status: 'PASS' | 'FAIL';
  details: Record<string, unknown>;
  evidence: string[];
}

interface ReleasePreflightReport {
  phase: 'Release';
  taskId: 'TA-RLS-003';
  generatedAt: string;
  release: {
    version: string;
    targetTag: string;
    branch: string;
    commit: string;
  };
  summary: {
    totalChecks: number;
    passedChecks: number;
    failedChecks: number;
  };
  decision: 'READY_FOR_TAG' | 'BLOCKED';
  checks: PreflightCheck[];
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

async function runCheck(
  spec: {
    id: string;
    title: string;
    evidence: string[];
    run: () => Promise<Record<string, unknown>> | Record<string, unknown>;
  },
): Promise<PreflightCheck> {
  try {
    const details = await spec.run();
    return {
      id: spec.id,
      title: spec.title,
      status: 'PASS',
      details,
      evidence: spec.evidence,
    };
  } catch (error) {
    return {
      id: spec.id,
      title: spec.title,
      status: 'FAIL',
      evidence: spec.evidence,
      details: {
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

function hasLocalTag(repoRoot: string, tag: string): boolean {
  try {
    execSync(`git rev-parse -q --verify refs/tags/${tag}`, {
      cwd: repoRoot,
      stdio: 'pipe',
      encoding: 'utf8',
    });
    return true;
  } catch {
    return false;
  }
}

function hasRemoteTag(repoRoot: string, tag: string): boolean {
  try {
    const output = execSync(`git ls-remote --tags origin refs/tags/${tag}`, {
      cwd: repoRoot,
      stdio: 'pipe',
      encoding: 'utf8',
    }).trim();
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
  const maxReportAgeHours = Number.parseInt(process.env.TELAGENT_CROSS_NODE_MAX_AGE_HOURS ?? '72', 10);

  const outputPath =
    process.env.TELAGENT_RELEASE_V020_PREFLIGHT_OUTPUT_PATH ??
    path.resolve(
      repoRoot,
      'docs/implementation/release/manifests/2026-03-04-v0.2.0-release-preflight.json',
    );

  const branch = execSync('git rev-parse --abbrev-ref HEAD', {
    cwd: repoRoot,
    stdio: 'pipe',
    encoding: 'utf8',
  }).trim();
  const commit = execSync('git rev-parse HEAD', {
    cwd: repoRoot,
    stdio: 'pipe',
    encoding: 'utf8',
  }).trim();

  const checks = await Promise.all([
    runCheck({
      id: 'RLS20-001',
      title: 'Phase 6-17 Gate 结论全部为 PASS',
      evidence: Array.from({ length: 12 }, (_value, index) => `docs/implementation/gates/phase-${index + 6}-gate.md`),
      run: async () => {
        const result: Record<string, string> = {};
        for (let phase = 6; phase <= 17; phase += 1) {
          const relativePath = `docs/implementation/gates/phase-${phase}-gate.md`;
          const absolutePath = path.resolve(repoRoot, relativePath);
          const content = await fs.readFile(absolutePath, 'utf8');
          ensure(content.includes('结论：`PASS`'), `phase-${phase}-gate conclusion is not PASS`);
          result[`phase${phase}`] = 'PASS';
        }
        return result;
      },
    }),
    runCheck({
      id: 'RLS20-002',
      title: '跨节点联调报告为 PASS 且未过期',
      evidence: ['docs/implementation/phase-17/cross-node-chat-check-report.json'],
      run: async () => {
        const reportPath = path.resolve(repoRoot, 'docs/implementation/phase-17/cross-node-chat-check-report.json');
        const report = await readJson<{
          generatedAt?: string;
          decision?: string;
          checks?: {
            nodeAToNodeB?: { delivered?: boolean; latencyMs?: number };
            nodeBToNodeA?: { delivered?: boolean; latencyMs?: number };
          };
        }>(reportPath);

        ensure(report.decision === 'PASS', 'cross-node decision is not PASS');
        ensure(report.checks?.nodeAToNodeB?.delivered === true, 'node A -> B delivery is not true');
        ensure(report.checks?.nodeBToNodeA?.delivered === true, 'node B -> A delivery is not true');
        ensure(Boolean(report.generatedAt), 'cross-node generatedAt is missing');

        const generatedAtMs = Date.parse(report.generatedAt ?? '');
        ensure(Number.isFinite(generatedAtMs), 'cross-node generatedAt is invalid');
        const ageHours = (Date.now() - generatedAtMs) / (1000 * 60 * 60);
        ensure(ageHours <= maxReportAgeHours, `cross-node report is too old: ${ageHours.toFixed(2)}h > ${maxReportAgeHours}h`);

        return {
          generatedAt: report.generatedAt,
          ageHours: Number(ageHours.toFixed(2)),
          nodeAToNodeBLatencyMs: report.checks?.nodeAToNodeB?.latencyMs ?? -1,
          nodeBToNodeALatencyMs: report.checks?.nodeBToNodeA?.latencyMs ?? -1,
          maxAllowedAgeHours: maxReportAgeHours,
        };
      },
    }),
    runCheck({
      id: 'RLS20-003',
      title: 'Node 回归日志显示 fail=0',
      evidence: ['docs/implementation/phase-17/logs/2026-03-04-p17-node-test.txt'],
      run: async () => {
        const logPath = path.resolve(repoRoot, 'docs/implementation/phase-17/logs/2026-03-04-p17-node-test.txt');
        const log = await fs.readFile(logPath, 'utf8');
        const testsMatch = log.match(/(?:ℹ\s*tests\s*|tests\s*[:=]\s*)(\d+)/i);
        const failMatch = log.match(/(?:ℹ\s*fail\s*|fail(?:ed)?\s*[:=]\s*)(\d+)/i);
        const tests = Number.parseInt(testsMatch?.[1] ?? '0', 10);
        const fail = Number.parseInt(failMatch?.[1] ?? '-1', 10);
        ensure(tests > 0, 'tests count is missing or invalid');
        ensure(fail === 0, `expected fail=0, got fail=${fail}`);
        return {
          tests,
          fail,
        };
      },
    }),
    runCheck({
      id: 'RLS20-004',
      title: `版本号一致且符合 ${releaseVersion} 发布目标`,
      evidence: [
        'package.json',
        'packages/node/package.json',
        'packages/protocol/package.json',
        'packages/console/package.json',
        'packages/sdk/package.json',
      ],
      run: async () => {
        const rootPkg = await readJson<{ version: string }>(path.resolve(repoRoot, 'package.json'));
        const nodePkg = await readJson<{ version: string }>(path.resolve(repoRoot, 'packages/node/package.json'));
        const protocolPkg = await readJson<{ version: string }>(path.resolve(repoRoot, 'packages/protocol/package.json'));
        const consolePkg = await readJson<{ version: string }>(path.resolve(repoRoot, 'packages/console/package.json'));
        const sdkPkg = await readJson<{ version: string }>(path.resolve(repoRoot, 'packages/sdk/package.json'));
        const versions = [rootPkg.version, nodePkg.version, protocolPkg.version, consolePkg.version, sdkPkg.version];
        ensure(versions.every((item) => item === releaseVersion), `package versions must all equal ${releaseVersion}`);
        return {
          target: releaseVersion,
          versions,
        };
      },
    }),
    runCheck({
      id: 'RLS20-005',
      title: `目标标签 ${targetTag} 尚未存在（避免重复发版）`,
      evidence: ['git tag', 'git ls-remote --tags origin'],
      run: async () => {
        const localExists = hasLocalTag(repoRoot, targetTag);
        const remoteExists = hasRemoteTag(repoRoot, targetTag);
        ensure(!localExists, `local tag ${targetTag} already exists`);
        ensure(!remoteExists, `remote tag ${targetTag} already exists`);
        return {
          targetTag,
          localExists,
          remoteExists,
        };
      },
    }),
    runCheck({
      id: 'RLS20-006',
      title: '工作区无未提交改动（发布前清洁）',
      evidence: ['git status --porcelain'],
      run: async () => {
        const status = execSync('git status --porcelain', {
          cwd: repoRoot,
          stdio: 'pipe',
          encoding: 'utf8',
        }).trim();
        ensure(status.length === 0, 'git worktree is not clean');
        return {
          clean: true,
        };
      },
    }),
  ]);

  const passedChecks = checks.filter((item) => item.status === 'PASS').length;
  const failedChecks = checks.length - passedChecks;

  const report: ReleasePreflightReport = {
    phase: 'Release',
    taskId: 'TA-RLS-003',
    generatedAt: new Date().toISOString(),
    release: {
      version: releaseVersion,
      targetTag,
      branch,
      commit,
    },
    summary: {
      totalChecks: checks.length,
      passedChecks,
      failedChecks,
    },
    decision: failedChecks === 0 ? 'READY_FOR_TAG' : 'BLOCKED',
    checks,
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(`[TA-RLS-003] checks: ${passedChecks}/${checks.length} PASS`);
  console.log(`[TA-RLS-003] decision=${report.decision}`);
  console.log(`[TA-RLS-003] output=${outputPath}`);

  if (report.decision !== 'READY_FOR_TAG') {
    throw new Error('release preflight failed');
  }
}

main().catch((error) => {
  console.error('[TA-RLS-003] preflight execution failed');
  console.error(error);
  process.exitCode = 1;
});

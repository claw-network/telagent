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
  taskId: 'TA-RLS-001';
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
      evidence: spec.evidence,
      details,
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

async function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptDir, '../../..');

  const outputPath =
    process.env.TELAGENT_RELEASE_PREFLIGHT_OUTPUT_PATH ??
    path.resolve(
      repoRoot,
      'docs/implementation/release/manifests/2026-03-03-v0.1.0-release-preflight.json',
    );

  const releaseVersion = process.env.TELAGENT_RELEASE_VERSION ?? '0.1.0';
  const targetTag = process.env.TELAGENT_RELEASE_TAG ?? `v${releaseVersion}`;

  const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();
  const commit = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();

  const phase5GatePath = path.resolve(repoRoot, 'docs/implementation/gates/phase-5-gate.md');
  const readinessManifestPath = path.resolve(
    repoRoot,
    'docs/implementation/phase-5/manifests/2026-03-03-p5-readiness-report.json',
  );
  const securityManifestPath = path.resolve(
    repoRoot,
    'docs/implementation/phase-5/manifests/2026-03-03-p5-security-review.json',
  );
  const faultManifestPath = path.resolve(
    repoRoot,
    'docs/implementation/phase-5/manifests/2026-03-03-p5-fault-injection-drill.json',
  );
  const nodeServerPath = path.resolve(repoRoot, 'packages/node/src/api/server.ts');

  const checks = await Promise.all([
    runCheck({
      id: 'RLS-001',
      title: 'Phase 5 Gate 已 PASS 且允许发布',
      evidence: ['docs/implementation/gates/phase-5-gate.md'],
      run: async () => {
        const gate = await fs.readFile(phase5GatePath, 'utf8');
        ensure(gate.includes('结论：`PASS`'), 'phase-5 gate conclusion is not PASS');
        ensure(gate.includes('是否允许发布：`YES`'), 'phase-5 gate does not allow release');
        return {
          gatePath: phase5GatePath,
          pass: true,
        };
      },
    }),
    runCheck({
      id: 'RLS-002',
      title: 'Readiness 结论为 GO',
      evidence: ['docs/implementation/phase-5/manifests/2026-03-03-p5-readiness-report.json'],
      run: async () => {
        const readiness = await readJson<{
          decision?: { goNoGo?: string; rationale?: string };
        }>(readinessManifestPath);
        ensure(readiness.decision?.goNoGo === 'GO', 'readiness go/no-go is not GO');
        return {
          goNoGo: readiness.decision?.goNoGo,
          rationale: readiness.decision?.rationale ?? '',
        };
      },
    }),
    runCheck({
      id: 'RLS-003',
      title: '安全评审高危风险清零',
      evidence: ['docs/implementation/phase-5/manifests/2026-03-03-p5-security-review.json'],
      run: async () => {
        const security = await readJson<{
          decision?: string;
          summary?: { totalChecks?: number; passedChecks?: number; highRiskOpenCount?: number; criticalOpenCount?: number };
        }>(securityManifestPath);
        ensure(security.decision === 'PASS', 'security review decision is not PASS');
        ensure((security.summary?.criticalOpenCount ?? 1) === 0, 'criticalOpenCount must be 0');
        ensure((security.summary?.highRiskOpenCount ?? 1) === 0, 'highRiskOpenCount must be 0');
        return {
          decision: security.decision,
          totalChecks: security.summary?.totalChecks ?? 0,
          passedChecks: security.summary?.passedChecks ?? 0,
          criticalOpenCount: security.summary?.criticalOpenCount ?? -1,
          highRiskOpenCount: security.summary?.highRiskOpenCount ?? -1,
        };
      },
    }),
    runCheck({
      id: 'RLS-004',
      title: '故障注入演练通过',
      evidence: ['docs/implementation/phase-5/manifests/2026-03-03-p5-fault-injection-drill.json'],
      run: async () => {
        const fault = await readJson<{
          summary?: { total?: number; passed?: number; failed?: number; passRate?: number };
        }>(faultManifestPath);
        ensure((fault.summary?.failed ?? 1) === 0, 'fault injection summary.failed must be 0');
        ensure((fault.summary?.passRate ?? 0) === 1, 'fault injection passRate must be 1');
        return {
          total: fault.summary?.total ?? 0,
          passed: fault.summary?.passed ?? 0,
          failed: fault.summary?.failed ?? 0,
          passRate: fault.summary?.passRate ?? 0,
        };
      },
    }),
    runCheck({
      id: 'RLS-005',
      title: 'API 路由前缀维持 /api/v1/*',
      evidence: ['packages/node/src/api/server.ts'],
      run: async () => {
        const source = await fs.readFile(nodeServerPath, 'utf8');
        const mountMatches = source.match(/router\.mount\('\/api\/v1\//g) ?? [];
        const legacyMatches = source.match(/router\.mount\('\/v1\//g) ?? [];
        ensure(mountMatches.length >= 6, 'expected /api/v1 route mounts');
        ensure(legacyMatches.length === 0, 'legacy /v1 route mount must not exist');
        return {
          apiV1MountCount: mountMatches.length,
          legacyV1MountCount: legacyMatches.length,
        };
      },
    }),
    runCheck({
      id: 'RLS-006',
      title: '版本号一致且符合 v0.1.0 发布目标',
      evidence: ['package.json', 'packages/node/package.json', 'packages/protocol/package.json', 'packages/web/package.json'],
      run: async () => {
        const rootPkg = await readJson<{ version: string }>(path.resolve(repoRoot, 'package.json'));
        const nodePkg = await readJson<{ version: string }>(path.resolve(repoRoot, 'packages/node/package.json'));
        const protocolPkg = await readJson<{ version: string }>(path.resolve(repoRoot, 'packages/protocol/package.json'));
        const webPkg = await readJson<{ version: string }>(path.resolve(repoRoot, 'packages/web/package.json'));
        const versions = [rootPkg.version, nodePkg.version, protocolPkg.version, webPkg.version];
        ensure(versions.every((version) => version === releaseVersion), `package versions must all equal ${releaseVersion}`);
        return {
          versions,
          target: releaseVersion,
        };
      },
    }),
  ]);

  const passedChecks = checks.filter((item) => item.status === 'PASS').length;
  const failedChecks = checks.length - passedChecks;

  const report: ReleasePreflightReport = {
    phase: 'Release',
    taskId: 'TA-RLS-001',
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
  await fs.writeFile(outputPath, JSON.stringify(report, null, 2) + '\n', 'utf8');

  console.log(`[TA-RLS-001] checks: ${passedChecks}/${checks.length} PASS`);
  console.log(`[TA-RLS-001] decision=${report.decision}`);
  console.log(`[TA-RLS-001] output=${outputPath}`);

  if (report.decision !== 'READY_FOR_TAG') {
    throw new Error('release preflight failed');
  }
}

main().catch((error) => {
  console.error('[TA-RLS-001] preflight execution failed');
  console.error(error);
  process.exitCode = 1;
});

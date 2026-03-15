import { execSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

interface DualCloudSmokeReport {
  phase: 'Release';
  taskId: 'TA-RLS-004';
  generatedAt: string;
  thresholds: {
    maxLatencyMs: number;
    maxCombinedLatencyMs: number;
  };
  input: {
    nodeAUrl: string;
    nodeBUrl: string;
    nodeADomain: string;
    nodeBDomain: string;
    nodeADid: string;
    nodeBDid: string;
  };
  execution: {
    command: string;
    commandStdoutTail: string;
  };
  checks: {
    crossNodeDecision: 'PASS' | 'FAIL';
    nodeAToNodeB: {
      delivered: boolean;
      latencyMs: number;
      withinThreshold: boolean;
    };
    nodeBToNodeA: {
      delivered: boolean;
      latencyMs: number;
      withinThreshold: boolean;
    };
    combinedLatencyMs: number;
    combinedWithinThreshold: boolean;
  };
  decision: 'PASS' | 'BLOCKED';
}

function ensure(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function tailLines(input: string, maxLines: number): string {
  return input
    .trim()
    .split('\n')
    .slice(-maxLines)
    .join('\n');
}

async function main(): Promise<void> {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptDir, '../../..');

  const maxLatencyMs = Number.parseInt(process.env.TELAGENT_RELEASE_SMOKE_MAX_LATENCY_MS ?? '3000', 10);
  const maxCombinedLatencyMs = Number.parseInt(
    process.env.TELAGENT_RELEASE_SMOKE_MAX_COMBINED_LATENCY_MS ?? '5000',
    10,
  );

  const outputPath =
    process.env.TELAGENT_RELEASE_V020_DUAL_SMOKE_OUTPUT_PATH ??
    path.resolve(
      repoRoot,
      'docs/implementation/release/manifests/2026-03-04-v0.2.0-dual-cloud-smoke-check.json',
    );

  const crossNodeReportPath = path.resolve(repoRoot, 'docs/implementation/phase-17/cross-node-chat-check-report.json');

  const command = 'corepack pnpm --filter @telagent/node exec tsx scripts/run-cross-node-chat-check.ts';
  const commandOutput = execSync(command, {
    cwd: repoRoot,
    stdio: 'pipe',
    encoding: 'utf8',
    env: process.env,
  });

  const crossNode = JSON.parse(await fs.readFile(crossNodeReportPath, 'utf8')) as {
    input?: {
      nodeAUrl?: string;
      nodeBUrl?: string;
      nodeADomain?: string;
      nodeBDomain?: string;
      nodeADid?: string;
      nodeBDid?: string;
    };
    checks?: {
      nodeAToNodeB?: { delivered?: boolean; latencyMs?: number };
      nodeBToNodeA?: { delivered?: boolean; latencyMs?: number };
    };
    decision?: 'PASS' | 'FAIL';
  };

  const latencyA = crossNode.checks?.nodeAToNodeB?.latencyMs ?? -1;
  const latencyB = crossNode.checks?.nodeBToNodeA?.latencyMs ?? -1;
  const combinedLatencyMs = latencyA + latencyB;

  const report: DualCloudSmokeReport = {
    phase: 'Release',
    taskId: 'TA-RLS-004',
    generatedAt: new Date().toISOString(),
    thresholds: {
      maxLatencyMs,
      maxCombinedLatencyMs,
    },
    input: {
      nodeAUrl: crossNode.input?.nodeAUrl ?? '',
      nodeBUrl: crossNode.input?.nodeBUrl ?? '',
      nodeADomain: crossNode.input?.nodeADomain ?? '',
      nodeBDomain: crossNode.input?.nodeBDomain ?? '',
      nodeADid: crossNode.input?.nodeADid ?? '',
      nodeBDid: crossNode.input?.nodeBDid ?? '',
    },
    execution: {
      command,
      commandStdoutTail: tailLines(commandOutput, 30),
    },
    checks: {
      crossNodeDecision: crossNode.decision ?? 'FAIL',
      nodeAToNodeB: {
        delivered: crossNode.checks?.nodeAToNodeB?.delivered ?? false,
        latencyMs: latencyA,
        withinThreshold: latencyA >= 0 && latencyA <= maxLatencyMs,
      },
      nodeBToNodeA: {
        delivered: crossNode.checks?.nodeBToNodeA?.delivered ?? false,
        latencyMs: latencyB,
        withinThreshold: latencyB >= 0 && latencyB <= maxLatencyMs,
      },
      combinedLatencyMs,
      combinedWithinThreshold: combinedLatencyMs >= 0 && combinedLatencyMs <= maxCombinedLatencyMs,
    },
    decision: 'BLOCKED',
  };

  report.decision =
    report.checks.crossNodeDecision === 'PASS' &&
    report.checks.nodeAToNodeB.delivered &&
    report.checks.nodeBToNodeA.delivered &&
    report.checks.nodeAToNodeB.withinThreshold &&
    report.checks.nodeBToNodeA.withinThreshold &&
    report.checks.combinedWithinThreshold
      ? 'PASS'
      : 'BLOCKED';

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(`[TA-RLS-004] decision=${report.decision}`);
  console.log(`[TA-RLS-004] output=${outputPath}`);

  ensure(report.decision === 'PASS', 'dual-cloud smoke check did not meet release thresholds');
}

main().catch((error) => {
  console.error('[TA-RLS-004] dual-cloud smoke check failed');
  console.error(error);
  process.exitCode = 1;
});

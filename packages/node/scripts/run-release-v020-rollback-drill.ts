import { execSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

interface NodeHealthSnapshot {
  url: string;
  did: string;
  domain: string;
}

interface RollbackDrillReport {
  phase: 'Release';
  taskId: 'TA-RLS-005';
  generatedAt: string;
  drill: {
    rollbackTargetTag: string;
    rollbackCommand: string;
    rollbackCommandOutputTail: string;
  };
  input: {
    nodeAUrl: string;
    nodeBUrl: string;
    expectedNodeADid: string;
    expectedNodeBDid: string;
  };
  checks: {
    rollbackTargetTagExists: boolean;
    before: {
      nodeA: NodeHealthSnapshot;
      nodeB: NodeHealthSnapshot;
    };
    after: {
      nodeA: NodeHealthSnapshot;
      nodeB: NodeHealthSnapshot;
    };
    postRollbackCrossNodeDecision: 'PASS' | 'FAIL';
    postRollbackCrossNodeDeliveredBoth: boolean;
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

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`request failed ${url} -> ${response.status}`);
  }
  return response.json();
}

async function readNodeHealth(baseUrl: string): Promise<NodeHealthSnapshot> {
  const identityPayload = await fetchJson(`${baseUrl}/api/v1/identities/self`);

  const identity = identityPayload as { data?: { did?: string } };

  return {
    url: baseUrl,
    did: identity.data?.did ?? '',
    domain: '',
  };
}

function hasTag(repoRoot: string, tag: string): boolean {
  try {
    execSync(`git rev-parse -q --verify refs/tags/${tag}`, {
      cwd: repoRoot,
      stdio: 'pipe',
      encoding: 'utf8',
    });
    return true;
  } catch {
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
}

async function main(): Promise<void> {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptDir, '../../..');

  const rollbackTargetTag = process.env.TELAGENT_ROLLBACK_TARGET_TAG ?? 'v0.1.0';
  const rollbackCommand = process.env.TELAGENT_ROLLBACK_DRILL_COMMAND ?? '';

  ensure(rollbackCommand.trim().length > 0, 'TELAGENT_ROLLBACK_DRILL_COMMAND is required');

  const nodeAUrl = process.env.TELAGENT_NODE_A_URL ?? 'https://alex.telagent.org';
  const nodeBUrl = process.env.TELAGENT_NODE_B_URL ?? 'https://bess.telagent.org';
  const expectedNodeADid = process.env.TELAGENT_NODE_A_DID ?? '';
  const expectedNodeBDid = process.env.TELAGENT_NODE_B_DID ?? '';

  const outputPath =
    process.env.TELAGENT_RELEASE_V020_ROLLBACK_OUTPUT_PATH ??
    path.resolve(
      repoRoot,
      'docs/implementation/release/manifests/2026-03-04-v0.2.0-rollback-drill.json',
    );

  const rollbackTargetTagExists = hasTag(repoRoot, rollbackTargetTag);
  ensure(rollbackTargetTagExists, `rollback target tag ${rollbackTargetTag} does not exist`);

  const beforeA = await readNodeHealth(nodeAUrl);
  const beforeB = await readNodeHealth(nodeBUrl);

  if (expectedNodeADid) {
    ensure(beforeA.did === expectedNodeADid, `node A did mismatch: expected ${expectedNodeADid}, got ${beforeA.did}`);
  }
  if (expectedNodeBDid) {
    ensure(beforeB.did === expectedNodeBDid, `node B did mismatch: expected ${expectedNodeBDid}, got ${beforeB.did}`);
  }

  const rollbackCommandOutput = execSync(rollbackCommand, {
    cwd: repoRoot,
    stdio: 'pipe',
    encoding: 'utf8',
    env: process.env,
    shell: '/bin/bash',
  });

  execSync('corepack pnpm --filter @telagent/node exec tsx scripts/run-cross-node-chat-check.ts', {
    cwd: repoRoot,
    stdio: 'pipe',
    encoding: 'utf8',
    env: process.env,
  });

  const crossNode = JSON.parse(
    await fs.readFile(path.resolve(repoRoot, 'docs/implementation/phase-17/cross-node-chat-check-report.json'), 'utf8'),
  ) as {
    decision?: 'PASS' | 'FAIL';
    checks?: {
      nodeAToNodeB?: { delivered?: boolean };
      nodeBToNodeA?: { delivered?: boolean };
    };
  };

  const afterA = await readNodeHealth(nodeAUrl);
  const afterB = await readNodeHealth(nodeBUrl);

  const deliveredBoth =
    crossNode.checks?.nodeAToNodeB?.delivered === true && crossNode.checks?.nodeBToNodeA?.delivered === true;

  const report: RollbackDrillReport = {
    phase: 'Release',
    taskId: 'TA-RLS-005',
    generatedAt: new Date().toISOString(),
    drill: {
      rollbackTargetTag,
      rollbackCommand,
      rollbackCommandOutputTail: tailLines(rollbackCommandOutput, 40),
    },
    input: {
      nodeAUrl,
      nodeBUrl,
      expectedNodeADid,
      expectedNodeBDid,
    },
    checks: {
      rollbackTargetTagExists,
      before: {
        nodeA: beforeA,
        nodeB: beforeB,
      },
      after: {
        nodeA: afterA,
        nodeB: afterB,
      },
      postRollbackCrossNodeDecision: crossNode.decision ?? 'FAIL',
      postRollbackCrossNodeDeliveredBoth: deliveredBoth,
    },
    decision:
      rollbackTargetTagExists && (crossNode.decision === 'PASS') && deliveredBoth ? 'PASS' : 'BLOCKED',
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(`[TA-RLS-005] decision=${report.decision}`);
  console.log(`[TA-RLS-005] output=${outputPath}`);

  ensure(report.decision === 'PASS', 'rollback drill did not pass');
}

main().catch((error) => {
  console.error('[TA-RLS-005] rollback drill failed');
  console.error(error);
  process.exitCode = 1;
});

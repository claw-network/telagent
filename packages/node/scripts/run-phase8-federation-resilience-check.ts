import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ErrorCodes, TelagentError } from '@telagent/protocol';

import { FederationService } from '../src/services/federation-service.js';

interface ScenarioResult {
  id: string;
  passed: boolean;
  details: Record<string, unknown>;
}

interface P8FederationReport {
  phase: 'Phase 8';
  taskId: 'TA-P8-003';
  generatedAt: string;
  summary: {
    total: number;
    passed: number;
    failed: number;
  };
  decision: 'PASS' | 'FAIL';
  scenarios: ScenarioResult[];
}

const GROUP_ID = `0x${'d'.repeat(64)}`;

function assertTelagentConflict(error: unknown): TelagentError {
  if (!(error instanceof TelagentError)) {
    throw new Error(`expected TelagentError, got ${String(error)}`);
  }
  if (error.code !== ErrorCodes.CONFLICT) {
    throw new Error(`expected CONFLICT, got ${error.code}`);
  }
  return error;
}

async function runScenario(id: string, run: () => Record<string, unknown>): Promise<ScenarioResult> {
  try {
    const details = run();
    return {
      id,
      passed: true,
      details,
    };
  } catch (error) {
    return {
      id,
      passed: false,
      details: {
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

async function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptDir, '../../..');
  const outputPath = process.env.P8_FEDERATION_OUTPUT_PATH
    ?? path.resolve(repoRoot, 'docs/implementation/phase-8/manifests/2026-03-03-p8-federation-resilience-check.json');

  const service = new FederationService({
    selfDomain: 'node-a.tel',
    allowedSourceDomains: ['node-b.tel'],
  });

  const scenarios: ScenarioResult[] = [];

  scenarios.push(await runScenario('P8-FED-001', () => {
    const first = service.syncGroupState(
      {
        groupId: GROUP_ID,
        state: 'PENDING_ONCHAIN',
      },
      {
        sourceDomain: 'node-b.tel',
      },
    );
    const second = service.syncGroupState(
      {
        groupId: GROUP_ID,
        state: 'PENDING_ONCHAIN',
      },
      {
        sourceDomain: 'node-b.tel',
      },
    );
    if (first.stateVersion !== 1 || second.stateVersion !== 1 || !second.deduplicated) {
      throw new Error('auto stateVersion bootstrap/dedupe validation failed');
    }
    return {
      first,
      second,
    };
  }));

  scenarios.push(await runScenario('P8-FED-002', () => {
    const upgraded = service.syncGroupState(
      {
        groupId: GROUP_ID,
        state: 'ACTIVE',
      },
      {
        sourceDomain: 'node-b.tel',
      },
    );
    if (upgraded.stateVersion !== 2 || upgraded.deduplicated) {
      throw new Error('state transition without explicit version must auto-increment');
    }

    const explicitNew = service.syncGroupState(
      {
        groupId: GROUP_ID,
        state: 'ACTIVE',
        stateVersion: 10,
      },
      {
        sourceDomain: 'node-b.tel',
      },
    );
    if (explicitNew.stateVersion !== 10) {
      throw new Error('explicit higher stateVersion was not accepted');
    }

    return {
      upgraded,
      explicitNew,
    };
  }));

  scenarios.push(await runScenario('P8-FED-003', () => {
    let staleError = '';
    try {
      service.syncGroupState(
        {
          groupId: GROUP_ID,
          state: 'ACTIVE',
          stateVersion: 9,
        },
        {
          sourceDomain: 'node-b.tel',
        },
      );
      throw new Error('expected stale stateVersion conflict');
    } catch (error) {
      staleError = assertTelagentConflict(error).message;
    }
    return {
      staleError,
    };
  }));

  scenarios.push(await runScenario('P8-FED-004', () => {
    let splitBrainError = '';
    try {
      service.syncGroupState(
        {
          groupId: GROUP_ID,
          state: 'REORGED_BACK',
          stateVersion: 10,
        },
        {
          sourceDomain: 'node-b.tel',
        },
      );
      throw new Error('expected split-brain conflict');
    } catch (error) {
      splitBrainError = assertTelagentConflict(error).message;
    }

    const recovery = service.syncGroupState(
      {
        groupId: GROUP_ID,
        state: 'REORGED_BACK',
        stateVersion: 11,
      },
      {
        sourceDomain: 'node-b.tel',
      },
    );
    if (recovery.stateVersion !== 11 || recovery.deduplicated) {
      throw new Error('recovery stateVersion was not accepted');
    }

    const info = service.nodeInfo();
    if (info.resilience.staleGroupStateSyncRejected !== 1) {
      throw new Error('staleGroupStateSyncRejected counter mismatch');
    }
    if (info.resilience.splitBrainGroupStateSyncDetected !== 1) {
      throw new Error('splitBrainGroupStateSyncDetected counter mismatch');
    }
    if (info.resilience.totalGroupStateSyncConflicts !== 2) {
      throw new Error('totalGroupStateSyncConflicts counter mismatch');
    }

    return {
      splitBrainError,
      recovery,
      resilience: info.resilience,
    };
  }));

  const passed = scenarios.filter((scenario) => scenario.passed).length;
  const failed = scenarios.length - passed;
  const report: P8FederationReport = {
    phase: 'Phase 8',
    taskId: 'TA-P8-003',
    generatedAt: new Date().toISOString(),
    summary: {
      total: scenarios.length,
      passed,
      failed,
    },
    decision: failed === 0 ? 'PASS' : 'FAIL',
    scenarios,
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(report, null, 2) + '\n', 'utf8');

  console.log(`[TA-P8-003] scenarios=${passed}/${scenarios.length}`);
  console.log(`[TA-P8-003] decision=${report.decision}`);
  console.log(`[TA-P8-003] output=${outputPath}`);

  if (report.decision !== 'PASS') {
    throw new Error('Phase 8 federation resilience check failed');
  }
}

main().catch((error) => {
  console.error('[TA-P8-003] execution failed');
  console.error(error);
  process.exitCode = 1;
});

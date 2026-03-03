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

interface P9ProtocolCompatReport {
  phase: 'Phase 9';
  taskId: 'TA-P9-003';
  generatedAt: string;
  summary: {
    total: number;
    passed: number;
    failed: number;
  };
  decision: 'PASS' | 'FAIL';
  scenarios: ScenarioResult[];
}

function assertIsUnsupportedProtocolConflict(error: unknown): TelagentError {
  if (!(error instanceof TelagentError)) {
    throw new Error(`expected TelagentError, got ${String(error)}`);
  }
  if (error.code !== ErrorCodes.UNPROCESSABLE) {
    throw new Error(`expected UNPROCESSABLE, got ${error.code}`);
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
  const outputPath = process.env.P9_PROTOCOL_COMPAT_OUTPUT_PATH
    ?? path.resolve(repoRoot, 'docs/implementation/phase-9/manifests/2026-03-03-p9-federation-protocol-compat-check.json');

  const service = new FederationService({
    selfDomain: 'node-a.tel',
    protocolVersion: 'v2',
    supportedProtocolVersions: ['v1', 'v2'],
    allowedSourceDomains: ['node-b.tel', 'node-c.tel'],
  });

  const scenarios: ScenarioResult[] = [];

  scenarios.push(await runScenario('P9-PC-001', () => {
    const acceptedV1 = service.receiveEnvelope(
      {
        envelopeId: 'p9-env-v1',
        sourceDomain: 'node-b.tel',
      },
      {
        sourceDomain: 'node-b.tel',
        protocolVersion: 'v1',
      },
    );
    const acceptedV2 = service.receiveEnvelope(
      {
        envelopeId: 'p9-env-v2',
        sourceDomain: 'node-b.tel',
      },
      {
        sourceDomain: 'node-b.tel',
        protocolVersion: 'v2',
      },
    );
    if (!acceptedV1.accepted || !acceptedV2.accepted) {
      throw new Error('compatible v1/v2 envelopes must be accepted');
    }
    return {
      acceptedV1,
      acceptedV2,
    };
  }));

  scenarios.push(await runScenario('P9-PC-002', () => {
    const acceptedWithoutHint = service.recordReceipt(
      {
        envelopeId: 'p9-env-v2',
        status: 'delivered',
      },
      {
        sourceDomain: 'node-b.tel',
      },
    );
    if (!acceptedWithoutHint.accepted) {
      throw new Error('receipt without protocol hint must be accepted using self version');
    }
    return {
      acceptedWithoutHint,
    };
  }));

  scenarios.push(await runScenario('P9-PC-003', () => {
    let unsupportedError = '';
    try {
      service.syncGroupState(
        {
          groupId: `0x${'9'.repeat(64)}`,
          state: 'ACTIVE',
          stateVersion: 1,
        },
        {
          sourceDomain: 'node-c.tel',
          protocolVersion: 'v3',
        },
      );
      throw new Error('expected unsupported protocol to be rejected');
    } catch (error) {
      unsupportedError = assertIsUnsupportedProtocolConflict(error).message;
    }
    return {
      unsupportedError,
    };
  }));

  scenarios.push(await runScenario('P9-PC-004', () => {
    const info = service.nodeInfo();
    if (info.protocolVersion !== 'v2') {
      throw new Error('nodeInfo protocolVersion mismatch');
    }
    if (info.compatibility.supportedProtocolVersions.join(',') !== 'v1,v2') {
      throw new Error('supported protocol matrix mismatch');
    }
    if (info.compatibility.stats.acceptedWithProtocolHint !== 2) {
      throw new Error('acceptedWithProtocolHint mismatch');
    }
    if (info.compatibility.stats.acceptedWithoutProtocolHint !== 1) {
      throw new Error('acceptedWithoutProtocolHint mismatch');
    }
    if (info.compatibility.stats.unsupportedProtocolRejected !== 1) {
      throw new Error('unsupportedProtocolRejected mismatch');
    }
    return {
      compatibility: info.compatibility,
    };
  }));

  const passed = scenarios.filter((scenario) => scenario.passed).length;
  const failed = scenarios.length - passed;
  const report: P9ProtocolCompatReport = {
    phase: 'Phase 9',
    taskId: 'TA-P9-003',
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

  console.log(`[TA-P9-003] scenarios=${passed}/${scenarios.length}`);
  console.log(`[TA-P9-003] decision=${report.decision}`);
  console.log(`[TA-P9-003] output=${outputPath}`);

  if (report.decision !== 'PASS') {
    throw new Error('Phase 9 protocol compatibility check failed');
  }
}

main().catch((error) => {
  console.error('[TA-P9-003] execution failed');
  console.error(error);
  process.exitCode = 1;
});

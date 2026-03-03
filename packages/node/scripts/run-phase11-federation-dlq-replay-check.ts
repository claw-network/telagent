import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { FederationService } from '../src/services/federation-service.js';

interface Phase11FederationDlqReplayReport {
  phase: 'Phase 11';
  taskId: 'TA-P11-005';
  generatedAt: string;
  summary: {
    capturedCount: number;
    replayProcessed: number;
    replayedCount: number;
    failedCount: number;
    orderPreserved: boolean;
    pendingAfterReplay: number;
  };
  decision: 'PASS' | 'FAIL';
  details: Record<string, unknown>;
}

async function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptDir, '../../..');
  const outputPath = process.env.P11_DLQ_OUTPUT_PATH
    ?? path.resolve(repoRoot, 'docs/implementation/phase-11/manifests/2026-03-03-p11-federation-dlq-replay-check.json');

  const service = new FederationService({
    selfDomain: 'node-a.tel',
  });

  const first = service.recordDlqFailure(
    'envelopes',
    {
      envelopeId: 'p11-dlq-env-1',
      sourceDomain: 'node-b.tel',
      payload: 'ciphertext-1',
    },
    {
      sourceDomain: 'node-b.tel',
    },
    new Error('federation upstream timeout'),
  );
  const second = service.recordDlqFailure(
    'envelopes',
    {
      envelopeId: 'p11-dlq-env-2',
      sourceDomain: 'node-b.tel',
      payload: 'ciphertext-2',
    },
    {
      sourceDomain: 'node-b.tel',
    },
    new Error('federation upstream reset'),
  );

  const captured = service.listDlqEntries({ status: 'PENDING' });
  const replay = service.replayDlq({ stopOnError: true });
  const pendingAfterReplay = service.listDlqEntries({ status: 'PENDING' }).length;

  const capturedOrder = captured.map((entry) => entry.dlqId);
  const replayOrder = replay.results.map((entry) => entry.dlqId);
  const orderPreserved = JSON.stringify(capturedOrder) === JSON.stringify(replayOrder);

  const report: Phase11FederationDlqReplayReport = {
    phase: 'Phase 11',
    taskId: 'TA-P11-005',
    generatedAt: new Date().toISOString(),
    summary: {
      capturedCount: captured.length,
      replayProcessed: replay.processed,
      replayedCount: replay.replayed,
      failedCount: replay.failed,
      orderPreserved,
      pendingAfterReplay,
    },
    decision:
      captured.length === 2
      && replay.processed === 2
      && replay.replayed === 2
      && replay.failed === 0
      && orderPreserved
      && pendingAfterReplay === 0
        ? 'PASS'
        : 'FAIL',
    details: {
      firstDlqId: first.dlqId,
      secondDlqId: second.dlqId,
      capturedOrder,
      replayOrder,
      replayResults: replay.results,
      nodeInfoDlq: service.nodeInfo().dlq,
    },
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(report, null, 2) + '\n', 'utf8');

  console.log(`[TA-P11-005] captured=${report.summary.capturedCount} replayProcessed=${report.summary.replayProcessed}`);
  console.log(
    `[TA-P11-005] replayed=${report.summary.replayedCount} failed=${report.summary.failedCount} orderPreserved=${report.summary.orderPreserved}`,
  );
  console.log(`[TA-P11-005] pendingAfterReplay=${report.summary.pendingAfterReplay}`);
  console.log(`[TA-P11-005] decision=${report.decision}`);
  console.log(`[TA-P11-005] output=${outputPath}`);

  if (report.decision !== 'PASS') {
    throw new Error('Phase 11 federation DLQ replay check failed');
  }
}

main().catch((error) => {
  console.error('[TA-P11-005] execution failed');
  console.error(error);
  process.exitCode = 1;
});

import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ErrorCodes, TelagentError, type AgentDID } from '@telagent/protocol';

import { KeyLifecycleService, type KeySuite } from '../src/services/key-lifecycle-service.js';

interface MutableClock {
  now(): number;
  tick(ms: number): void;
}

interface FleetNode {
  nodeId: string;
  did: AgentDID;
  lifecycle: KeyLifecycleService;
}

interface RotationBatch {
  batchId: string;
  nodeIds: string[];
}

interface RotationEvent {
  atMs: number;
  action: string;
  batchId?: string;
  nodeId?: string;
  suite?: KeySuite;
  fromKeyId?: string;
  toKeyId?: string;
  note?: string;
}

interface Phase12KeyRotationReport {
  phase: 'Phase 12';
  taskId: 'TA-P12-007';
  generatedAt: string;
  summary: {
    stagedRolloutPass: boolean;
    failureRollbackPass: boolean;
    oldKeysRetiredPass: boolean;
    fleetHealthyPass: boolean;
    batchesExecuted: number;
  };
  decision: 'PASS' | 'FAIL';
  details: Record<string, unknown>;
}

function createClock(startMs = 1_772_582_700_000): MutableClock {
  let nowMs = startMs;
  return {
    now() {
      return nowMs;
    },
    tick(ms: number) {
      nowMs += ms;
    },
  };
}

function keyHex(seed: string): string {
  return `0x${createHash('sha256').update(seed).digest('hex')}`;
}

function keyId(nodeId: string, suite: KeySuite, version: string): string {
  return `${suite}-${nodeId}-${version}`;
}

function isForbidden(error: unknown): boolean {
  return error instanceof TelagentError && error.code === ErrorCodes.FORBIDDEN;
}

function assertCanUse(
  node: FleetNode,
  suite: KeySuite,
  currentKeyByNode: Map<string, { signal: string; mls: string }>,
): boolean {
  const keys = currentKeyByNode.get(node.nodeId);
  if (!keys) {
    return false;
  }
  const key = suite === 'signal' ? keys.signal : keys.mls;
  try {
    node.lifecycle.assertCanUseKey({
      did: node.did,
      suite,
      keyId: key,
    });
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptDir, '../../..');
  const outputPath = process.env.P12_KEY_ROTATION_OUTPUT_PATH
    ?? path.resolve(repoRoot, 'docs/implementation/phase-12/manifests/2026-03-03-p12-key-rotation-orchestrator-check.json');

  const clock = createClock();
  const events: RotationEvent[] = [];
  const nodes: FleetNode[] = ['node-a', 'node-b', 'node-c', 'node-d', 'node-e', 'node-f'].map((nodeId) => ({
    nodeId,
    did: `did:claw:z${nodeId.replace('-', '').toUpperCase()}` as AgentDID,
    lifecycle: new KeyLifecycleService({
      clock,
      defaultSignalGraceSec: 90,
      defaultMlsGraceSec: 90,
    }),
  }));
  const byNode = new Map(nodes.map((node) => [node.nodeId, node]));
  const currentKeyByNode = new Map<string, { signal: string; mls: string }>();
  const oldKeyByNode = new Map<string, { signal: string; mls: string }>();

  for (const node of nodes) {
    const signalV1 = keyId(node.nodeId, 'signal', 'v1');
    const mlsV1 = keyId(node.nodeId, 'mls', 'v1');
    node.lifecycle.registerKey({
      did: node.did,
      suite: 'signal',
      keyId: signalV1,
      publicKey: keyHex(`${node.nodeId}:signal:v1`),
    });
    node.lifecycle.registerKey({
      did: node.did,
      suite: 'mls',
      keyId: mlsV1,
      publicKey: keyHex(`${node.nodeId}:mls:v1`),
    });
    currentKeyByNode.set(node.nodeId, { signal: signalV1, mls: mlsV1 });
    oldKeyByNode.set(node.nodeId, { signal: signalV1, mls: mlsV1 });
    events.push({
      atMs: clock.now(),
      action: 'register-initial',
      nodeId: node.nodeId,
      note: `signal=${signalV1} mls=${mlsV1}`,
    });
  }

  const batches: RotationBatch[] = [
    { batchId: 'canary', nodeIds: ['node-a'] },
    { batchId: 'wave-1', nodeIds: ['node-b', 'node-c'] },
    { batchId: 'wave-2', nodeIds: ['node-d', 'node-e', 'node-f'] },
  ];

  let stagedRolloutPass = true;
  let failureRollbackPass = true;
  const executedBatches: string[] = [];

  for (const batch of batches) {
    const untouchedNodesBefore = nodes
      .map((node) => node.nodeId)
      .filter((nodeId) => !batch.nodeIds.includes(nodeId));
    const untouchedKeySnapshot = new Map(
      untouchedNodesBefore.map((nodeId) => [nodeId, { ...currentKeyByNode.get(nodeId)! }]),
    );

    for (const nodeId of batch.nodeIds) {
      const node = byNode.get(nodeId);
      if (!node) {
        stagedRolloutPass = false;
        continue;
      }
      const signalV2 = keyId(node.nodeId, 'signal', 'v2');
      const mlsV2 = keyId(node.nodeId, 'mls', 'v2');
      const current = currentKeyByNode.get(node.nodeId)!;

      node.lifecycle.rotateKey({
        did: node.did,
        suite: 'signal',
        fromKeyId: current.signal,
        toKeyId: signalV2,
        publicKey: keyHex(`${node.nodeId}:signal:v2`),
        gracePeriodSec: 90,
      });
      events.push({
        atMs: clock.now(),
        action: 'rotate',
        batchId: batch.batchId,
        nodeId,
        suite: 'signal',
        fromKeyId: current.signal,
        toKeyId: signalV2,
      });

      node.lifecycle.rotateKey({
        did: node.did,
        suite: 'mls',
        fromKeyId: current.mls,
        toKeyId: mlsV2,
        publicKey: keyHex(`${node.nodeId}:mls:v2`),
        gracePeriodSec: 90,
      });
      events.push({
        atMs: clock.now(),
        action: 'rotate',
        batchId: batch.batchId,
        nodeId,
        suite: 'mls',
        fromKeyId: current.mls,
        toKeyId: mlsV2,
      });

      currentKeyByNode.set(node.nodeId, {
        signal: signalV2,
        mls: mlsV2,
      });
    }

    for (const nodeId of untouchedNodesBefore) {
      const node = byNode.get(nodeId)!;
      const snapshot = untouchedKeySnapshot.get(nodeId)!;
      const current = currentKeyByNode.get(nodeId)!;
      if (snapshot.signal !== current.signal || snapshot.mls !== current.mls) {
        stagedRolloutPass = false;
      }
      const signalUsable = assertCanUse(node, 'signal', currentKeyByNode);
      const mlsUsable = assertCanUse(node, 'mls', currentKeyByNode);
      if (!signalUsable || !mlsUsable) {
        stagedRolloutPass = false;
      }
    }

    executedBatches.push(batch.batchId);
    clock.tick(5_000);
  }

  // Failure injection and rollback drill on wave-2 member.
  const failedNode = byNode.get('node-e');
  if (!failedNode) {
    failureRollbackPass = false;
  } else {
    const current = currentKeyByNode.get(failedNode.nodeId)!;
    failedNode.lifecycle.revokeKey({
      did: failedNode.did,
      suite: 'signal',
      keyId: current.signal,
      reason: 'post-rotation-smoke-check-failed',
    });
    failedNode.lifecycle.revokeKey({
      did: failedNode.did,
      suite: 'mls',
      keyId: current.mls,
      reason: 'post-rotation-smoke-check-failed',
    });
    events.push({
      atMs: clock.now(),
      action: 'revoke-failed-node',
      batchId: 'wave-2',
      nodeId: failedNode.nodeId,
      note: `signal=${current.signal} mls=${current.mls}`,
    });

    let revokedBlocked = true;
    try {
      failedNode.lifecycle.assertCanUseKey({
        did: failedNode.did,
        suite: 'signal',
        keyId: current.signal,
      });
      revokedBlocked = false;
    } catch (error) {
      revokedBlocked = isForbidden(error);
    }
    if (!revokedBlocked) {
      failureRollbackPass = false;
    }

    const signalRollback = `${current.signal}-rollback`;
    const mlsRollback = `${current.mls}-rollback`;
    failedNode.lifecycle.recoverKey({
      did: failedNode.did,
      suite: 'signal',
      revokedKeyId: current.signal,
      recoveredKeyId: signalRollback,
      publicKey: keyHex(`${failedNode.nodeId}:signal:rollback`),
    });
    failedNode.lifecycle.recoverKey({
      did: failedNode.did,
      suite: 'mls',
      revokedKeyId: current.mls,
      recoveredKeyId: mlsRollback,
      publicKey: keyHex(`${failedNode.nodeId}:mls:rollback`),
    });
    currentKeyByNode.set(failedNode.nodeId, {
      signal: signalRollback,
      mls: mlsRollback,
    });
    events.push({
      atMs: clock.now(),
      action: 'rollback-recover',
      nodeId: failedNode.nodeId,
      note: `signal=${signalRollback} mls=${mlsRollback}`,
    });

    const signalRecovered = assertCanUse(failedNode, 'signal', currentKeyByNode);
    const mlsRecovered = assertCanUse(failedNode, 'mls', currentKeyByNode);
    if (!signalRecovered || !mlsRecovered) {
      failureRollbackPass = false;
    }
  }

  // Ensure old keys are retired after rotation grace period.
  clock.tick(91_000);
  let oldKeysRetiredPass = true;
  for (const node of nodes) {
    const old = oldKeyByNode.get(node.nodeId)!;
    for (const suite of ['signal', 'mls'] as const) {
      try {
        node.lifecycle.assertCanUseKey({
          did: node.did,
          suite,
          keyId: old[suite],
        });
        oldKeysRetiredPass = false;
      } catch (error) {
        if (!isForbidden(error)) {
          oldKeysRetiredPass = false;
        }
      }
    }
  }

  let fleetHealthyPass = true;
  const finalFleetStatus = nodes.map((node) => {
    const current = currentKeyByNode.get(node.nodeId)!;
    const signalActive = assertCanUse(node, 'signal', currentKeyByNode);
    const mlsActive = assertCanUse(node, 'mls', currentKeyByNode);
    if (!signalActive || !mlsActive) {
      fleetHealthyPass = false;
    }
    return {
      nodeId: node.nodeId,
      did: node.did,
      currentKeys: current,
      signalActive,
      mlsActive,
      lifecycle: {
        signal: node.lifecycle.listKeys(node.did, 'signal'),
        mls: node.lifecycle.listKeys(node.did, 'mls'),
      },
    };
  });

  const report: Phase12KeyRotationReport = {
    phase: 'Phase 12',
    taskId: 'TA-P12-007',
    generatedAt: new Date().toISOString(),
    summary: {
      stagedRolloutPass,
      failureRollbackPass,
      oldKeysRetiredPass,
      fleetHealthyPass,
      batchesExecuted: executedBatches.length,
    },
    decision:
      stagedRolloutPass
      && failureRollbackPass
      && oldKeysRetiredPass
      && fleetHealthyPass
        ? 'PASS'
        : 'FAIL',
    details: {
      batches,
      executedBatches,
      finalFleetStatus,
      events,
      clockNow: clock.now(),
    },
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(`[TA-P12-007] stagedRolloutPass=${stagedRolloutPass}`);
  console.log(`[TA-P12-007] failureRollbackPass=${failureRollbackPass}`);
  console.log(`[TA-P12-007] oldKeysRetiredPass=${oldKeysRetiredPass}`);
  console.log(`[TA-P12-007] fleetHealthyPass=${fleetHealthyPass}`);
  console.log(`[TA-P12-007] decision=${report.decision}`);
  console.log(`[TA-P12-007] output=${outputPath}`);

  if (report.decision !== 'PASS') {
    throw new Error('Phase 12 key rotation orchestrator check failed');
  }
}

main().catch((error) => {
  console.error('[TA-P12-007] execution failed');
  console.error(error);
  process.exitCode = 1;
});

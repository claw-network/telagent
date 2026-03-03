import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ErrorCodes, TelagentError } from '@telagent/protocol';

import { FederationService } from '../src/services/federation-service.js';

interface RollbackDrillReport {
  phase: 'Phase 10';
  taskId: 'TA-P10-003';
  generatedAt: string;
  config: {
    stableVersion: string;
    rolloutVersion: string;
    stableSupported: string[];
    rolloutSupported: string[];
    usesRolloutManifest: boolean;
  };
  summary: {
    rolloutAcceptsTarget: boolean;
    rolloutRejectsLegacy: boolean;
    rollbackAcceptsLegacy: boolean;
    rollbackRejectsTarget: boolean;
    rollbackStepsPrepared: boolean;
  };
  decision: 'PASS' | 'FAIL';
  details: Record<string, unknown>;
}

interface RolloutManifest {
  decision?: string;
  stages?: Array<{
    stageId: string;
    nodes?: Array<{ domain?: string }>;
  }>;
}

function normalizeProtocolVersion(input: string, name: string): string {
  const normalized = input.trim().toLowerCase();
  if (!/^v[0-9]+(?:\.[0-9]+)?$/.test(normalized)) {
    throw new Error(`${name} must match vN or vN.M`);
  }
  return normalized;
}

function parseProtocols(raw: string, name: string): string[] {
  const values = raw
    .split(',')
    .map((item) => normalizeProtocolVersion(item, name));
  return [...new Set(values)];
}

function assertUnprocessable(error: unknown): TelagentError {
  if (!(error instanceof TelagentError)) {
    throw new Error(`expected TelagentError, got ${String(error)}`);
  }
  if (error.code !== ErrorCodes.UNPROCESSABLE) {
    throw new Error(`expected UNPROCESSABLE, got ${error.code}`);
  }
  return error;
}

async function readRolloutManifestIfExists(manifestPath: string): Promise<RolloutManifest | null> {
  try {
    const raw = await fs.readFile(manifestPath, 'utf8');
    return JSON.parse(raw) as RolloutManifest;
  } catch {
    return null;
  }
}

async function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptDir, '../../..');
  const defaultRolloutManifest = path.resolve(
    repoRoot,
    'docs/implementation/phase-10/manifests/2026-03-03-p10-federation-rollout-automation.json',
  );
  const outputPath = process.env.P10_ROLLBACK_OUTPUT_PATH
    ?? path.resolve(repoRoot, 'docs/implementation/phase-10/manifests/2026-03-03-p10-federation-rollback-drill.json');

  const stableVersion = normalizeProtocolVersion(process.env.P10_STABLE_VERSION || 'v2', 'P10_STABLE_VERSION');
  const rolloutVersion = normalizeProtocolVersion(process.env.P10_ROLLOUT_VERSION || 'v3', 'P10_ROLLOUT_VERSION');
  const stableSupported = parseProtocols(process.env.P10_STABLE_SUPPORTED || `v1,${stableVersion}`, 'P10_STABLE_SUPPORTED');
  const rolloutSupported = parseProtocols(process.env.P10_ROLLOUT_SUPPORTED || `${stableVersion},${rolloutVersion}`, 'P10_ROLLOUT_SUPPORTED');
  const rolloutManifestPath = process.env.P10_ROLLOUT_MANIFEST_PATH || defaultRolloutManifest;
  const rolloutManifest = await readRolloutManifestIfExists(rolloutManifestPath);

  const rolloutService = new FederationService({
    selfDomain: 'node-a.tel',
    protocolVersion: rolloutVersion,
    supportedProtocolVersions: rolloutSupported,
    allowedSourceDomains: ['node-b.tel'],
  });

  const rollbackService = new FederationService({
    selfDomain: 'node-a.tel',
    protocolVersion: stableVersion,
    supportedProtocolVersions: stableSupported,
    allowedSourceDomains: ['node-b.tel'],
  });

  const legacyVersion = stableSupported.find((item) => item !== stableVersion) ?? stableVersion;
  const rolloutAcceptsTarget = rolloutService.receiveEnvelope(
    {
      envelopeId: 'p10-rollout-target',
      sourceDomain: 'node-b.tel',
    },
    {
      sourceDomain: 'node-b.tel',
      protocolVersion: rolloutVersion,
    },
  ).accepted;

  let rolloutRejectsLegacy = false;
  let rolloutLegacyRejectMessage = '';
  try {
    rolloutService.receiveEnvelope(
      {
        envelopeId: 'p10-rollout-legacy',
        sourceDomain: 'node-b.tel',
      },
      {
        sourceDomain: 'node-b.tel',
        protocolVersion: legacyVersion,
      },
    );
  } catch (error) {
    rolloutRejectsLegacy = true;
    rolloutLegacyRejectMessage = assertUnprocessable(error).message;
  }

  const rollbackAcceptsLegacy = rollbackService.receiveEnvelope(
    {
      envelopeId: 'p10-rollback-legacy',
      sourceDomain: 'node-b.tel',
    },
    {
      sourceDomain: 'node-b.tel',
      protocolVersion: legacyVersion,
    },
  ).accepted;

  let rollbackRejectsTarget = false;
  let rollbackTargetRejectMessage = '';
  try {
    rollbackService.receiveEnvelope(
      {
        envelopeId: 'p10-rollback-target',
        sourceDomain: 'node-b.tel',
      },
      {
        sourceDomain: 'node-b.tel',
        protocolVersion: rolloutVersion,
      },
    );
  } catch (error) {
    rollbackRejectsTarget = true;
    rollbackTargetRejectMessage = assertUnprocessable(error).message;
  }

  const rollbackStepsPrepared = !!rolloutManifest
    && rolloutManifest.decision === 'PASS'
    && (rolloutManifest.stages?.length ?? 0) > 0;

  const report: RollbackDrillReport = {
    phase: 'Phase 10',
    taskId: 'TA-P10-003',
    generatedAt: new Date().toISOString(),
    config: {
      stableVersion,
      rolloutVersion,
      stableSupported,
      rolloutSupported,
      usesRolloutManifest: !!rolloutManifest,
    },
    summary: {
      rolloutAcceptsTarget,
      rolloutRejectsLegacy,
      rollbackAcceptsLegacy,
      rollbackRejectsTarget,
      rollbackStepsPrepared,
    },
    decision:
      rolloutAcceptsTarget
        && rolloutRejectsLegacy
        && rollbackAcceptsLegacy
        && rollbackRejectsTarget
        && rollbackStepsPrepared
        ? 'PASS'
        : 'FAIL',
    details: {
      rolloutManifestPath,
      rolloutManifestDecision: rolloutManifest?.decision ?? null,
      rolloutLegacyRejectMessage,
      rollbackTargetRejectMessage,
      rollbackPlanSteps: rolloutManifest?.stages?.map((stage) => stage.stageId) ?? [],
    },
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(report, null, 2) + '\n', 'utf8');

  console.log(
    `[TA-P10-003] rolloutAcceptsTarget=${rolloutAcceptsTarget} rolloutRejectsLegacy=${rolloutRejectsLegacy} rollbackAcceptsLegacy=${rollbackAcceptsLegacy} rollbackRejectsTarget=${rollbackRejectsTarget}`,
  );
  console.log(`[TA-P10-003] rollbackStepsPrepared=${rollbackStepsPrepared}`);
  console.log(`[TA-P10-003] decision=${report.decision}`);
  console.log(`[TA-P10-003] output=${outputPath}`);

  if (report.decision !== 'PASS') {
    throw new Error('Phase 10 federation rollback drill failed');
  }
}

main().catch((error) => {
  console.error('[TA-P10-003] execution failed');
  console.error(error);
  process.exitCode = 1;
});

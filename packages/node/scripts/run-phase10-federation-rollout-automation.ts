import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

interface RolloutNode {
  domain: string;
  region: string;
}

interface RolloutStage {
  stageId: string;
  description: string;
  nodes: RolloutNode[];
  prechecks: string[];
  successCriteria: string[];
}

interface RolloutAutomationReport {
  phase: 'Phase 10';
  taskId: 'TA-P10-002';
  generatedAt: string;
  config: {
    currentProtocolVersion: string;
    targetProtocolVersion: string;
    supportedProtocolVersions: string[];
    totalNodes: number;
    canaryPercent: number;
  };
  summary: {
    stages: number;
    coveredNodes: number;
    uniqueCoveredNodes: number;
    duplicateAssignments: number;
    missingAssignments: number;
  };
  decision: 'PASS' | 'FAIL';
  stages: RolloutStage[];
}

const DEFAULT_NODES: RolloutNode[] = [
  { domain: 'node-a.tel', region: 'cn-sh' },
  { domain: 'node-b.tel', region: 'cn-bj' },
  { domain: 'node-c.tel', region: 'sg' },
  { domain: 'node-d.tel', region: 'jp' },
  { domain: 'node-e.tel', region: 'eu-de' },
  { domain: 'node-f.tel', region: 'us-va' },
  { domain: 'node-g.tel', region: 'us-ca' },
  { domain: 'node-h.tel', region: 'br-sp' },
];

function normalizeProtocolVersion(input: string, name: string): string {
  const normalized = input.trim().toLowerCase();
  if (!/^v[0-9]+(?:\.[0-9]+)?$/.test(normalized)) {
    throw new Error(`${name} must match vN or vN.M`);
  }
  return normalized;
}

function parseNodes(raw: string | undefined): RolloutNode[] {
  if (!raw || !raw.trim()) {
    return DEFAULT_NODES;
  }
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((entry, index) => {
      const [domainRaw, regionRaw] = entry.split('@').map((part) => part.trim());
      if (!domainRaw) {
        throw new Error(`invalid node entry at index ${index}`);
      }
      return {
        domain: domainRaw.toLowerCase(),
        region: (regionRaw || 'unknown').toLowerCase(),
      };
    });
}

function buildStages(nodes: RolloutNode[], canaryPercent: number): RolloutStage[] {
  const total = nodes.length;
  const canaryCount = Math.max(1, Math.ceil(total * (canaryPercent / 100)));
  const canary = nodes.slice(0, canaryCount);
  const remaining = nodes.slice(canaryCount);
  const wave2Count = Math.ceil(remaining.length / 2);
  const wave2 = remaining.slice(0, wave2Count);
  const wave3 = remaining.slice(wave2Count);

  const stages: RolloutStage[] = [
    {
      stageId: 'P10-ROLLOUT-S1',
      description: 'Canary 10-20% rollout',
      nodes: canary,
      prechecks: [
        'protocol compatibility check script PASS',
        'per-node config backup completed',
        'federation node-info baseline captured',
      ],
      successCriteria: [
        'no incompatibility spikes in 15 minutes',
        'unsupportedProtocolRejected growth remains expected',
        'federation health endpoints healthy',
      ],
    },
  ];

  if (wave2.length > 0) {
    stages.push({
      stageId: 'P10-ROLLOUT-S2',
      description: 'Mid-wave rollout to 50% of remaining nodes',
      nodes: wave2,
      prechecks: [
        'Stage 1 canary approval signed by TL/SRE',
        'rollback script dry-run completed',
      ],
      successCriteria: [
        'cross-region federation sync latency within SLO',
        'no split-brain conflict anomalies',
      ],
    });
  }

  if (wave3.length > 0) {
    stages.push({
      stageId: 'P10-ROLLOUT-S3',
      description: 'Full rollout to remaining nodes',
      nodes: wave3,
      prechecks: [
        'Stage 2 approval signed by TL/SRE',
        'rollback guardrail enabled',
      ],
      successCriteria: [
        'all nodes on target protocol',
        'rollback checkpoints archived',
      ],
    });
  }

  return stages;
}

async function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptDir, '../../..');
  const outputPath = process.env.P10_ROLLOUT_OUTPUT_PATH
    ?? path.resolve(repoRoot, 'docs/implementation/phase-10/manifests/2026-03-03-p10-federation-rollout-automation.json');

  const currentProtocolVersion = normalizeProtocolVersion(
    process.env.P10_CURRENT_PROTOCOL_VERSION || 'v2',
    'P10_CURRENT_PROTOCOL_VERSION',
  );
  const targetProtocolVersion = normalizeProtocolVersion(
    process.env.P10_TARGET_PROTOCOL_VERSION || 'v3',
    'P10_TARGET_PROTOCOL_VERSION',
  );
  const supportedProtocolVersions = (process.env.P10_SUPPORTED_PROTOCOL_VERSIONS || `${currentProtocolVersion},${targetProtocolVersion}`)
    .split(',')
    .map((item) => normalizeProtocolVersion(item, 'P10_SUPPORTED_PROTOCOL_VERSIONS'));
  const canaryPercentRaw = Number.parseInt(process.env.P10_CANARY_PERCENT || '20', 10);
  const canaryPercent = Number.isFinite(canaryPercentRaw) ? Math.min(50, Math.max(5, canaryPercentRaw)) : 20;
  const nodes = parseNodes(process.env.P10_ROLLOUT_NODES);

  const stages = buildStages(nodes, canaryPercent);
  const covered = stages.flatMap((stage) => stage.nodes.map((node) => node.domain));
  const uniqueCovered = new Set(covered);
  const duplicateAssignments = covered.length - uniqueCovered.size;
  const missingAssignments = nodes.length - uniqueCovered.size;

  const report: RolloutAutomationReport = {
    phase: 'Phase 10',
    taskId: 'TA-P10-002',
    generatedAt: new Date().toISOString(),
    config: {
      currentProtocolVersion,
      targetProtocolVersion,
      supportedProtocolVersions: [...new Set(supportedProtocolVersions)],
      totalNodes: nodes.length,
      canaryPercent,
    },
    summary: {
      stages: stages.length,
      coveredNodes: covered.length,
      uniqueCoveredNodes: uniqueCovered.size,
      duplicateAssignments,
      missingAssignments,
    },
    decision:
      uniqueCovered.size === nodes.length
        && duplicateAssignments === 0
        && supportedProtocolVersions.includes(currentProtocolVersion)
        && supportedProtocolVersions.includes(targetProtocolVersion)
        ? 'PASS'
        : 'FAIL',
    stages,
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(report, null, 2) + '\n', 'utf8');

  console.log(`[TA-P10-002] stages=${report.summary.stages} nodes=${report.summary.uniqueCoveredNodes}/${report.config.totalNodes}`);
  console.log(`[TA-P10-002] decision=${report.decision}`);
  console.log(`[TA-P10-002] output=${outputPath}`);

  if (report.decision !== 'PASS') {
    throw new Error('Phase 10 federation rollout automation failed');
  }
}

main().catch((error) => {
  console.error('[TA-P10-002] execution failed');
  console.error(error);
  process.exitCode = 1;
});

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

async function readJsonIfExists(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptDir, '../../..');
  const phase16Root = path.resolve(repoRoot, 'docs/implementation/phase-16');
  const manifestsRoot = path.resolve(phase16Root, 'manifests');
  const logsRoot = path.resolve(phase16Root, 'logs');
  const outputPath = process.env.P16_QUALITY_GATE_OUTPUT_PATH
    ?? path.resolve(manifestsRoot, '2026-03-03-p16-quality-gate-check.json');

  const requiredManifestPaths = [
    path.resolve(manifestsRoot, '2026-03-03-p16-ts-framework-check.json'),
    path.resolve(manifestsRoot, '2026-03-03-p16-identity-node-diagnostics-check.json'),
    path.resolve(manifestsRoot, '2026-03-03-p16-console-contract-regression-check.json'),
  ];
  const requiredLogPaths = [
    path.resolve(logsRoot, '2026-03-03-p16-console-typecheck-ta-p16-007.txt'),
    path.resolve(logsRoot, '2026-03-03-p16-console-build-ta-p16-007.txt'),
    path.resolve(logsRoot, '2026-03-03-p16-console-test-ta-p16-007.txt'),
  ];

  const manifestResults = [];
  for (const manifestPath of requiredManifestPaths) {
    const parsed = await readJsonIfExists(manifestPath);
    manifestResults.push({
      path: manifestPath,
      exists: Boolean(parsed),
      taskId: parsed?.taskId ?? null,
      decision: parsed?.decision ?? null,
      passed: parsed?.decision === 'PASS',
    });
  }

  const logResults = [];
  for (const logPath of requiredLogPaths) {
    logResults.push({
      path: logPath,
      exists: await exists(logPath),
    });
  }

  const passedManifestCount = manifestResults.filter((item) => item.passed).length;
  const missingLogCount = logResults.filter((item) => !item.exists).length;
  const decision = passedManifestCount === manifestResults.length && missingLogCount === 0 ? 'PASS' : 'FAIL';

  const report = {
    phase: 'Phase 16',
    taskId: 'TA-P16-007',
    generatedAt: new Date().toISOString(),
    summary: {
      checkedManifestCount: manifestResults.length,
      passedManifestCount,
      checkedLogCount: logResults.length,
      missingLogCount,
      qualityGateReady: decision === 'PASS',
    },
    decision,
    details: {
      manifests: manifestResults,
      logs: logResults,
    },
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(`[TA-P16-007] checkedManifestCount=${report.summary.checkedManifestCount}`);
  console.log(`[TA-P16-007] passedManifestCount=${report.summary.passedManifestCount}`);
  console.log(`[TA-P16-007] checkedLogCount=${report.summary.checkedLogCount}`);
  console.log(`[TA-P16-007] missingLogCount=${report.summary.missingLogCount}`);
  console.log(`[TA-P16-007] qualityGateReady=${report.summary.qualityGateReady}`);
  console.log(`[TA-P16-007] decision=${report.decision}`);
  console.log(`[TA-P16-007] output=${outputPath}`);

  if (decision !== 'PASS') {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('[TA-P16-007] execution failed');
  console.error(error);
  process.exitCode = 1;
});

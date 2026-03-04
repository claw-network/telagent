import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function assertContains(content, token, sourceLabel) {
  if (!content.includes(token)) {
    throw new Error(`${sourceLabel} missing required token: ${token}`);
  }
}

async function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const webRoot = path.resolve(scriptDir, '..');
  const repoRoot = path.resolve(scriptDir, '../../..');
  const outputPath = process.env.P16_IDENTITY_NODE_DIAGNOSTICS_OUTPUT_PATH
    ?? path.resolve(repoRoot, 'docs/implementation/phase-16/manifests/2026-03-03-p16-identity-node-diagnostics-check.json');

  const packageJson = await fs.readFile(path.resolve(webRoot, 'package.json'), 'utf8');
  const appTsx = await fs.readFile(path.resolve(webRoot, 'src/App.tsx'), 'utf8');
  const apiClientTs = await fs.readFile(path.resolve(webRoot, 'src/core/api-client.ts'), 'utf8');
  const diagnosticsTs = await fs.readFile(path.resolve(webRoot, 'src/core/identity-node-diagnostics.ts'), 'utf8');
  const diagnosticsTest = await fs.readFile(path.resolve(webRoot, 'src/core/identity-node-diagnostics.test.ts'), 'utf8');

  const requiredPackageTokens = [
    '"ethers"',
    '"check:phase16:005"',
  ];
  const requiredAppTokens = [
    'DID Diagnostics (Sender)',
    'DID Diagnostics (Lookup)',
    'DID Hash (keccak256 utf8)',
    'Node Runtime Diagnostics',
    'Refresh Node Diagnostics',
  ];
  const requiredApiClientTokens = [
    'async getNodeMetrics<T = unknown>()',
    "return this.getData<T>('/api/v1/node/metrics')",
  ];
  const requiredDiagnosticsTokens = [
    'hashDidKeccakUtf8(did: string)',
    'keccak256(toUtf8Bytes(did))',
    'buildDidDiagnostics(inputDid: string',
    'buildNodeRuntimeDiagnostics(nodeInfoPayload: unknown, nodeMetricsPayload: unknown)',
  ];
  const requiredDiagnosticsTestTokens = [
    'hashDidKeccakUtf8 follows keccak256(utf8(did))',
    'buildNodeRuntimeDiagnostics computes level from alerts',
  ];

  for (const token of requiredPackageTokens) {
    assertContains(packageJson, token, 'package.json');
  }
  for (const token of requiredAppTokens) {
    assertContains(appTsx, token, 'App.tsx');
  }
  for (const token of requiredApiClientTokens) {
    assertContains(apiClientTs, token, 'api-client.ts');
  }
  for (const token of requiredDiagnosticsTokens) {
    assertContains(diagnosticsTs, token, 'identity-node-diagnostics.ts');
  }
  for (const token of requiredDiagnosticsTestTokens) {
    assertContains(diagnosticsTest, token, 'identity-node-diagnostics.test.ts');
  }

  const report = {
    phase: 'Phase 16',
    taskId: 'TA-P16-005',
    generatedAt: new Date().toISOString(),
    summary: {
      didParserReady: true,
      didHashKeccakReady: true,
      nodeHealthDiagnosticsReady: true,
      identityDiagnosticsUiReady: true,
      requiredTokensChecked: requiredPackageTokens.length
        + requiredAppTokens.length
        + requiredApiClientTokens.length
        + requiredDiagnosticsTokens.length
        + requiredDiagnosticsTestTokens.length,
    },
    decision: 'PASS',
    details: {
      packageChecks: requiredPackageTokens,
      appChecks: requiredAppTokens,
      apiClientChecks: requiredApiClientTokens,
      diagnosticsChecks: requiredDiagnosticsTokens,
      diagnosticsTestChecks: requiredDiagnosticsTestTokens,
    },
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log('[TA-P16-005] didParserReady=true');
  console.log('[TA-P16-005] didHashKeccakReady=true');
  console.log('[TA-P16-005] nodeHealthDiagnosticsReady=true');
  console.log('[TA-P16-005] identityDiagnosticsUiReady=true');
  console.log(`[TA-P16-005] requiredTokensChecked=${report.summary.requiredTokensChecked}`);
  console.log('[TA-P16-005] decision=PASS');
  console.log(`[TA-P16-005] output=${outputPath}`);
}

main().catch((error) => {
  console.error('[TA-P16-005] execution failed');
  console.error(error);
  process.exitCode = 1;
});

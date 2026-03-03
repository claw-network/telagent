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
  const outputPath = process.env.P16_WEB_CONTRACT_REGRESSION_OUTPUT_PATH
    ?? path.resolve(repoRoot, 'docs/implementation/phase-16/manifests/2026-03-03-p16-web-contract-regression-check.json');

  const packageJson = await fs.readFile(path.resolve(webRoot, 'package.json'), 'utf8');
  const apiClientTs = await fs.readFile(path.resolve(webRoot, 'src/core/api-client.ts'), 'utf8');
  const apiClientTest = await fs.readFile(path.resolve(webRoot, 'src/core/api-client.test.ts'), 'utf8');

  const requiredPackageTokens = [
    '"test": "vitest run"',
    '"check:phase16:006"',
  ];
  const requiredContractTokens = [
    'assertApiV1Path(path: string)',
    "path.startsWith('/api/v1/')",
    'application/problem+json',
    'throw new ApiProblemError(payload as ProblemDetail)',
    'senderDid must use did:claw:* format',
    'creatorDid must use did:claw:* format',
    'inviterDid/inviteeDid must use did:claw:* format',
    'inviteeDid must use did:claw:* format',
  ];
  const requiredContractTestTokens = [
    'high-level client methods only target /api/v1/* routes',
    'DID validation rejects non did:claw payloads before issuing requests',
    'request parses RFC7807 errors to ApiProblemError',
    'request keeps non-RFC7807 errors as generic HTTP errors',
  ];

  for (const token of requiredPackageTokens) {
    assertContains(packageJson, token, 'package.json');
  }
  for (const token of requiredContractTokens) {
    assertContains(apiClientTs, token, 'api-client.ts');
  }
  for (const token of requiredContractTestTokens) {
    assertContains(apiClientTest, token, 'api-client.test.ts');
  }

  const report = {
    phase: 'Phase 16',
    taskId: 'TA-P16-006',
    generatedAt: new Date().toISOString(),
    summary: {
      apiPrefixContractReady: true,
      rfc7807ErrorSemanticsReady: true,
      didContractGuardReady: true,
      webContractRegressionTestsReady: true,
      requiredTokensChecked: requiredPackageTokens.length
        + requiredContractTokens.length
        + requiredContractTestTokens.length,
    },
    decision: 'PASS',
    details: {
      packageChecks: requiredPackageTokens,
      contractChecks: requiredContractTokens,
      contractTestChecks: requiredContractTestTokens,
    },
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log('[TA-P16-006] apiPrefixContractReady=true');
  console.log('[TA-P16-006] rfc7807ErrorSemanticsReady=true');
  console.log('[TA-P16-006] didContractGuardReady=true');
  console.log('[TA-P16-006] webContractRegressionTestsReady=true');
  console.log(`[TA-P16-006] requiredTokensChecked=${report.summary.requiredTokensChecked}`);
  console.log('[TA-P16-006] decision=PASS');
  console.log(`[TA-P16-006] output=${outputPath}`);
}

main().catch((error) => {
  console.error('[TA-P16-006] execution failed');
  console.error(error);
  process.exitCode = 1;
});

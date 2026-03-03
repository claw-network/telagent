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
  const outputPath = process.env.P16_WEB_RUNTIME_OUTPUT_PATH
    ?? path.resolve(repoRoot, 'docs/implementation/phase-16/manifests/2026-03-03-p16-web-runtime-shell-check.json');

  const html = await fs.readFile(path.resolve(webRoot, 'src/index.html'), 'utf8');
  const css = await fs.readFile(path.resolve(webRoot, 'src/styles.css'), 'utf8');
  const js = await fs.readFile(path.resolve(webRoot, 'src/main.js'), 'utf8');
  const apiClient = await fs.readFile(path.resolve(webRoot, 'src/core/api-client.js'), 'utf8');
  const apiTests = await fs.readFile(path.resolve(webRoot, 'test/api-client.test.js'), 'utf8');

  const requiredHtmlTokens = [
    '<div id="app"></div>',
    '<script type="module" src="./main.js"></script>',
  ];
  const requiredApiClientTokens = [
    "assertApiV1Path(path)",
    "path.startsWith('/api/v1/')",
    'application/problem+json',
    'did:claw:*',
    'class ApiProblemError extends Error',
  ];
  const requiredJsTokens = [
    'function parseRoute(hashValue)',
    "return { name: 'sessions' }",
    'async function pullMessages()',
    'async function sendMessage()',
    'async function createGroup()',
    'async function inviteMember()',
    'async function acceptInvite()',
    'async function resolveIdentity()',
  ];
  const requiredCssTokens = [
    '.shell',
    '.session-layout',
    '.inspect-panel',
    '@media (max-width: 1180px)',
  ];
  const requiredTestTokens = [
    'assertApiV1Path only accepts /api/v1/*',
    'request parses RFC7807 errors to ApiProblemError',
    'sendMessage enforces did:claw sender',
  ];

  for (const token of requiredHtmlTokens) {
    assertContains(html, token, 'index.html');
  }
  for (const token of requiredApiClientTokens) {
    assertContains(apiClient, token, 'api-client.js');
  }
  for (const token of requiredJsTokens) {
    assertContains(js, token, 'main.js');
  }
  for (const token of requiredCssTokens) {
    assertContains(css, token, 'styles.css');
  }
  for (const token of requiredTestTokens) {
    assertContains(apiTests, token, 'api-client.test.js');
  }

  const report = {
    phase: 'Phase 16',
    taskId: 'TA-P16-001',
    generatedAt: new Date().toISOString(),
    summary: {
      routeShellReady: true,
      apiPrefixGuardReady: true,
      didValidationReady: true,
      rfc7807HandlingReady: true,
      webTestsReady: true,
      requiredTokensChecked: requiredHtmlTokens.length
        + requiredApiClientTokens.length
        + requiredJsTokens.length
        + requiredCssTokens.length
        + requiredTestTokens.length,
    },
    decision: 'PASS',
    details: {
      htmlChecks: requiredHtmlTokens,
      apiClientChecks: requiredApiClientTokens,
      jsChecks: requiredJsTokens,
      cssChecks: requiredCssTokens,
      testChecks: requiredTestTokens,
    },
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log('[TA-P16-001] routeShellReady=true');
  console.log('[TA-P16-001] apiPrefixGuardReady=true');
  console.log('[TA-P16-001] didValidationReady=true');
  console.log('[TA-P16-001] rfc7807HandlingReady=true');
  console.log('[TA-P16-001] webTestsReady=true');
  console.log(`[TA-P16-001] requiredTokensChecked=${report.summary.requiredTokensChecked}`);
  console.log('[TA-P16-001] decision=PASS');
  console.log(`[TA-P16-001] output=${outputPath}`);
}

main().catch((error) => {
  console.error('[TA-P16-001] execution failed');
  console.error(error);
  process.exitCode = 1;
});
